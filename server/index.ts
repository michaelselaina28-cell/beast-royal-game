import cors from "cors";
import express from "express";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { ANIMAL_LIST } from "../shared/animals.js";
import { MODE_INFO, type ClientToServer, type ServerToClient } from "../shared/protocol.js";
import { validateNickname } from "../shared/validate.js";
import {
  chat,
  createRoom,
  getRoomByCode,
  getRoomByPlayer,
  joinRoom,
  kick,
  leaveRoom,
  lockAction,
  markConnected,
  markDisconnected,
  offerAlly,
  rematch,
  respondAlly,
  returnLobby,
  selectAnimal,
  setReady,
  setSettings,
  setTeam,
  startMatch,
  submitAction,
  viewFor,
  cleanupIdle,
  type LiveRoom,
} from "./rooms.js";
import {
  findAccount,
  getOrCreateProfile,
  getProfile,
  leaderboard,
  loadStore,
  matchHistory,
  registerAccount,
  updateNickname,
} from "./store.js";
import { newId, signToken, verifyToken } from "./token.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
app.use(express.json({ limit: "256kb" }));

loadStore();
setInterval(cleanupIdle, 60_000);

const buckets = new Map<string, number[]>();
function rate(key: string, max: number, windowMs = 60_000) {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) return false;
  arr.push(now);
  buckets.set(key, arr);
  return true;
}

function hashPassword(password: string, salt?: string) {
  const s = salt ?? randomBytes(12).toString("hex");
  const h = scryptSync(password, s, 32).toString("hex");
  return `${s}:${h}`;
}

function checkPassword(password: string, stored: string) {
  const [salt, h] = stored.split(":");
  const next = scryptSync(password, salt, 32);
  const prev = Buffer.from(h, "hex");
  return next.length === prev.length && timingSafeEqual(next, prev);
}

function authHeader(req: express.Request) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return null;
  return verifyToken(h.slice(7));
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "Beast Royale Clash", ts: Date.now() });
});

app.get("/api/roster", (_req, res) => {
  res.json({ animals: ANIMAL_LIST, modes: MODE_INFO });
});

app.post("/api/guest", (req, res) => {
  const nick = validateNickname(String(req.body?.nickname ?? "Hunter"));
  if (!nick.ok) return res.status(400).json({ error: nick.error });
  const id = newId("pl_");
  const profile = getOrCreateProfile(id, nick.value, true);
  const token = signToken({ id, nickname: nick.value, guest: true, iat: Date.now() });
  res.json({ token, profile });
});

app.post("/api/register", (req, res) => {
  const username = String(req.body?.username ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  const nick = validateNickname(String(req.body?.nickname ?? username));
  if (!/^[a-z0-9_]{3,16}$/.test(username)) return res.status(400).json({ error: "Username must be 3–16 letters, numbers, or _." });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
  if (!nick.ok) return res.status(400).json({ error: nick.error });
  if (findAccount(username)) return res.status(400).json({ error: "Username taken." });
  const id = newId("pl_");
  registerAccount(username, hashPassword(password), id);
  const profile = getOrCreateProfile(id, nick.value, false);
  const token = signToken({ id, nickname: nick.value, guest: false, iat: Date.now() });
  res.json({ token, profile });
});

app.post("/api/login", (req, res) => {
  const username = String(req.body?.username ?? "").trim();
  const password = String(req.body?.password ?? "");
  const acc = findAccount(username);
  if (!acc || !checkPassword(password, acc.passwordHash)) return res.status(400).json({ error: "Invalid credentials." });
  const profile = getProfile(acc.playerId);
  if (!profile) return res.status(400).json({ error: "Profile missing." });
  const token = signToken({ id: profile.id, nickname: profile.nickname, guest: false, iat: Date.now() });
  res.json({ token, profile });
});

app.post("/api/profile/nickname", (req, res) => {
  const session = authHeader(req);
  if (!session) return res.status(401).json({ error: "Sign in first." });
  const nick = validateNickname(String(req.body?.nickname ?? ""));
  if (!nick.ok) return res.status(400).json({ error: nick.error });
  updateNickname(session.id, nick.value);
  const profile = getOrCreateProfile(session.id, nick.value, session.guest);
  profile.nickname = nick.value;
  res.json({ profile, token: signToken({ id: session.id, nickname: nick.value, guest: session.guest, iat: Date.now() }) });
});

app.get("/api/me", (req, res) => {
  const session = authHeader(req);
  if (!session) return res.status(401).json({ error: "Sign in first." });
  const profile = getOrCreateProfile(session.id, session.nickname, session.guest);
  res.json({ profile, history: matchHistory(session.id) });
});

app.get("/api/leaderboard", (req, res) => {
  const sort = (String(req.query.sort ?? "wins") as "wins" | "kills" | "xp") || "wins";
  res.json({ rows: leaderboard(sort), sort });
});

app.get("/api/room/:code", (req, res) => {
  const live = getRoomByCode(req.params.code);
  if (!live) return res.status(404).json({ error: "Room not found." });
  res.json({
    code: live.room.code,
    status: live.room.status,
    mode: live.room.settings.mode,
    players: live.room.members.filter((m) => !m.isSpectator).length,
    max: live.room.settings.maxPlayers,
  });
});

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

interface Sock {
  ws: WebSocket;
  playerId?: string;
  ip: string;
}

const sockets = new Set<Sock>();
const completedRequests = new Map<string, { expiresAt: number; response: Extract<ServerToClient, { t: "request_result" }> }>();

function send(ws: WebSocket, msg: ServerToClient) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function sendRequestResult(
  sock: Sock,
  requestId: string | undefined,
  result: Omit<Extract<ServerToClient, { t: "request_result" }>, "t" | "requestId">,
) {
  if (!requestId) return;
  const response: Extract<ServerToClient, { t: "request_result" }> = { t: "request_result", requestId, ...result };
  if (sock.playerId) {
    const now = Date.now();
    for (const [key, cached] of completedRequests) {
      if (cached.expiresAt <= now) completedRequests.delete(key);
    }
    completedRequests.set(`${sock.playerId}:${requestId}`, { expiresAt: now + 5 * 60_000, response });
  }
  send(sock.ws, response);
}

function broadcastRoom(live: LiveRoom, except?: string) {
  for (const s of sockets) {
    if (!s.playerId) continue;
    if (except && s.playerId === except) continue;
    const inRoom = live.room.members.some((m) => m.playerId === s.playerId);
    if (!inRoom) continue;
    send(s.ws, { t: "room", room: live.room });
    const view = viewFor(live, s.playerId);
    if (view) send(s.ws, { t: "match", view });
  }
}

function attachLive(live: LiveRoom) {
  live.onUpdate = (l) => broadcastRoom(l);
}

wss.on("connection", (ws, req) => {
  const sock: Sock = { ws, ip: req.socket.remoteAddress || "unknown" };
  sockets.add(sock);
  ws.on("close", () => {
    if (sock.playerId) markDisconnected(sock.playerId);
    const live = sock.playerId ? getRoomByPlayer(sock.playerId) : undefined;
    if (live) broadcastRoom(live);
    sockets.delete(sock);
  });
  ws.on("message", (raw) => {
    let msg: ClientToServer;
    try {
      msg = JSON.parse(String(raw)) as ClientToServer;
    } catch {
      send(ws, { t: "error", message: "Malformed message." });
      return;
    }
    handle(sock, msg);
  });
});

function sessionOk(sock: Sock): boolean {
  return !!sock.playerId;
}

function handle(sock: Sock, msg: ClientToServer) {
  const ws = sock.ws;
  if (msg.t === "hello") {
    const payload = verifyToken(msg.token);
    if (!payload) {
      send(ws, { t: "error", message: "Invalid session. Enter a nickname again.", code: "auth" });
      return;
    }
    sock.playerId = payload.id;
    const profile = getOrCreateProfile(payload.id, payload.nickname, payload.guest);
    send(ws, { t: "hello_ok", profile, token: msg.token });
    const live = markConnected(payload.id, payload.nickname);
    if (live) {
      attachLive(live);
      send(ws, { t: "room", room: live.room });
      const view = viewFor(live, payload.id);
      if (view) send(ws, { t: "match", view });
    }
    return;
  }
  if (!sessionOk(sock) || !sock.playerId) {
    send(ws, { t: "error", message: "Authenticate first." });
    return;
  }
  const pid = sock.playerId;
  const profile = getProfile(pid);
  const nick = profile?.nickname ?? "Hunter";
  const requestId = "requestId" in msg ? msg.requestId : undefined;
  if (requestId) {
    const key = `${pid}:${requestId}`;
    const cached = completedRequests.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      send(ws, cached.response);
      return;
    }
  }

  if (msg.t === "create_room") {
    const existing = getRoomByPlayer(pid);
    if (existing?.room.status === "lobby") {
      sendRequestResult(sock, requestId, { ok: true, room: existing.room });
      return;
    }
    if (existing && (existing.room.status === "starting" || existing.room.status === "in_match")) {
      sendRequestResult(sock, requestId, { ok: false, message: "Return to the lobby before creating another room." });
      return;
    }
    if (!rate(`room:${sock.ip}`, Number(process.env.RATE_LIMIT_ROOM_PER_MIN || 8))) {
      sendRequestResult(sock, requestId, { ok: false, message: "Too many rooms. Wait a moment." });
      return;
    }
    if (existing) leaveRoom(pid);
    const live = createRoom(pid, nick, msg.settings ?? {});
    attachLive(live);
    broadcastRoom(live);
    sendRequestResult(sock, requestId, { ok: true, room: live.room });
    return;
  }

  if (msg.t === "join_room") {
    const existing = getRoomByPlayer(pid);
    if (existing && existing.room.code !== msg.code.trim().toUpperCase()) {
      if (existing.room.status === "starting" || existing.room.status === "in_match") {
        sendRequestResult(sock, requestId, { ok: false, message: "Leave your active match before joining another room." });
        return;
      }
      const previous = leaveRoom(pid);
      if (previous) broadcastRoom(previous);
    }
    const result = joinRoom(msg.code, pid, nick, msg.spectator);
    if (!result.ok) {
      sendRequestResult(sock, requestId, { ok: false, message: result.error });
      return;
    }
    attachLive(result.live);
    broadcastRoom(result.live);
    sendRequestResult(sock, requestId, { ok: true, room: result.live.room });
    return;
  }

  if (msg.t === "leave_room") {
    const live = leaveRoom(pid);
    if (live) broadcastRoom(live);
    return;
  }

  if (msg.t === "kick") {
    const r = kick(pid, msg.playerId);
    if (!r.ok) send(ws, { t: "error", message: r.error ?? "Kick failed." });
    else if (r.live) {
      for (const s of sockets) {
        if (s.playerId === msg.playerId) send(s.ws, { t: "toast", message: "The host removed you from the den.", kind: "warn" });
      }
      broadcastRoom(r.live);
    }
    return;
  }

  if (msg.t === "set_settings") {
    const r = setSettings(pid, msg.settings);
    if (!r.ok) send(ws, { t: "error", message: r.error ?? "Cannot change settings." });
    else broadcastRoom(r.live);
    return;
  }

  if (msg.t === "select_animal") {
    const r = selectAnimal(pid, msg.animalId);
    if (!r.ok) send(ws, { t: "error", message: r.error ?? "Cannot select." });
    else broadcastRoom(r.live);
    return;
  }

  if (msg.t === "set_ready") {
    const r = setReady(pid, msg.ready);
    if (!r.ok) sendRequestResult(sock, requestId, { ok: false, message: r.error ?? "Could not update readiness." });
    else {
      broadcastRoom(r.live);
      sendRequestResult(sock, requestId, { ok: true, room: r.live.room });
    }
    return;
  }

  if (msg.t === "set_team") {
    const r = setTeam(pid, msg.playerId, msg.teamId);
    if (!r.ok) send(ws, { t: "error", message: r.error ?? "Cannot assign team." });
    else broadcastRoom(r.live);
    return;
  }

  if (msg.t === "chat") {
    if (!rate(`chat:${pid}`, Number(process.env.RATE_LIMIT_CHAT_PER_MIN || 40))) {
      send(ws, { t: "error", message: "Chat slow down." });
      return;
    }
    const r = chat(pid, msg.text, msg.channel, msg.emote);
    if (!r.ok) send(ws, { t: "error", message: r.error ?? "Chat failed." });
    else {
      broadcastRoom(r.live);
      for (const s of sockets) {
        if (r.live.room.members.some((m) => m.playerId === s.playerId)) {
          send(s.ws, { t: "chat", message: r.message });
        }
      }
    }
    return;
  }

  if (msg.t === "start_match") {
    const live = getRoomByPlayer(pid);
    if (live?.room.status === "in_match") {
      sendRequestResult(sock, requestId, { ok: true, room: live.room });
      return;
    }
    const r = startMatch(pid);
    if (!r.ok) sendRequestResult(sock, requestId, { ok: false, message: r.error });
    else {
      attachLive(r.live);
      broadcastRoom(r.live);
      sendRequestResult(sock, requestId, { ok: true, room: r.live.room });
    }
    return;
  }

  if (msg.t === "submit_action") {
    const r = submitAction(pid, msg.action);
    if (!r.ok) send(ws, { t: "error", message: r.error });
    else {
      const view = viewFor(r.live, pid);
      if (view) send(ws, { t: "match", view });
    }
    return;
  }

  if (msg.t === "lock_action") {
    const r = lockAction(pid);
    if (!r.ok) send(ws, { t: "error", message: r.error });
    else broadcastRoom(r.live);
    return;
  }

  if (msg.t === "offer_ally") {
    const r = offerAlly(pid, msg.targetId);
    if (!r.ok) send(ws, { t: "error", message: r.error });
    else {
      broadcastRoom(r.live);
      send(ws, { t: "toast", message: "Truce offered.", kind: "info" });
    }
    return;
  }

  if (msg.t === "respond_ally") {
    const r = respondAlly(pid, msg.fromId, msg.accept);
    if (!r.ok) send(ws, { t: "error", message: r.error });
    else broadcastRoom(r.live);
    return;
  }

  if (msg.t === "last_stand") {
    const r = submitAction(pid, {
      actionId: msg.actionId,
      type: "last_stand",
      targetId: msg.targetId,
    });
    if (!r.ok) send(ws, { t: "error", message: r.error });
    else {
      lockAction(pid);
      broadcastRoom(r.live);
    }
    return;
  }

  if (msg.t === "rematch") {
    const r = rematch(pid);
    if (!r.ok) send(ws, { t: "error", message: r.error });
    else broadcastRoom(r.live);
    return;
  }

  if (msg.t === "return_lobby") {
    const r = returnLobby(pid);
    if (!r.ok) send(ws, { t: "error", message: r.error });
    else broadcastRoom(r.live);
    return;
  }

  if (msg.t === "sync") {
    const live = getRoomByPlayer(pid);
    if (!live) return;
    send(ws, { t: "room", room: live.room });
    const view = viewFor(live, pid);
    if (view) send(ws, { t: "match", view });
  }
}

const webDistCandidates = [
  join(__dir, "../dist"),
  join(__dir, "../../dist"),
  join(process.cwd(), "dist"),
];
const webDist = webDistCandidates.find((p) => existsSync(join(p, "index.html")));
if (webDist) {
  app.use(express.static(webDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/ws")) return next();
    res.sendFile(join(webDist, "index.html"));
  });
}

httpServer.listen(PORT, HOST, () => {
  console.log(`Beast Royale Clash server on http://${HOST}:${PORT}`);
});

