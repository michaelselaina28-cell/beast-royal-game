import type { ClientMatchView } from "@game/types";
import type { ChatMessage, PlayerProfile, RoomState } from "@game/types";
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { initMotion, sfx } from "./audio";
import { api, GameSocket } from "./net";

interface GameCtx {
  profile: PlayerProfile | null;
  token: string | null;
  room: RoomState | null;
  view: ClientMatchView | null;
  status: "off" | "connecting" | "live" | "lost";
  toasts: { id: number; message: string; kind: string }[];
  error: string | null;
  loading: boolean;
  send: GameSocket["send"];
  request: GameSocket["request"];
  guest: (nickname: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, nickname: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  dismissToast: (id: number) => void;
}

const Ctx = createContext<GameCtx | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem("brc-token"));
  const [room, setRoom] = useState<RoomState | null>(null);
  const [view, setView] = useState<ClientMatchView | null>(null);
  const [status, setStatus] = useState<GameCtx["status"]>("off");
  const [toasts, setToasts] = useState<GameCtx["toasts"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const sock = useRef(new GameSocket());
  const toastId = useRef(1);

  const push = (message: string, kind = "info") => {
    const id = toastId.current++;
    setToasts((t) => [...t, { id, message, kind }].slice(-5));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  };

  useEffect(() => {
    initMotion();
    const s = sock.current;
    s.onStatus = setStatus;
    s.onMessage = (msg) => {
      if (msg.t === "hello_ok") {
        setProfile(msg.profile);
        setToken(msg.token);
        localStorage.setItem("brc-token", msg.token);
      }
      if (msg.t === "error") {
        setError(msg.message);
        push(msg.message, "bad");
        sfx("warn");
      }
      if (msg.t === "room") setRoom(msg.room);
      if (msg.t === "request_result" && msg.room) setRoom(msg.room);
      if (msg.t === "match") setView(msg.view);
      if (msg.t === "toast") push(msg.message, msg.kind ?? "info");
      if (msg.t === "chat") sfx("click");
      if (msg.t === "profile") setProfile(msg.profile);
    };
    if (token) s.connect();
    return () => s.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remember = (t: string, p: PlayerProfile) => {
    localStorage.setItem("brc-token", t);
    setToken(t);
    setProfile(p);
    sock.current.connect();
  };

  const value = useMemo<GameCtx>(
    () => ({
      profile,
      token,
      room,
      view,
      status,
      toasts,
      error,
      loading,
      send: (m) => sock.current.send(m),
      request: (m) => sock.current.request(m),
      guest: async (nickname) => {
        setLoading(true);
        try {
          const r = await api<{ token: string; profile: PlayerProfile }>("/api/guest", {
            method: "POST",
            body: JSON.stringify({ nickname }),
          });
          remember(r.token, r.profile);
        } catch (e) {
          setError((e as Error).message);
          throw e;
        } finally {
          setLoading(false);
        }
      },
      login: async (username, password) => {
        setLoading(true);
        try {
          const r = await api<{ token: string; profile: PlayerProfile }>("/api/login", {
            method: "POST",
            body: JSON.stringify({ username, password }),
          });
          remember(r.token, r.profile);
        } catch (e) {
          setError((e as Error).message);
          throw e;
        } finally {
          setLoading(false);
        }
      },
      register: async (username, password, nickname) => {
        setLoading(true);
        try {
          const r = await api<{ token: string; profile: PlayerProfile }>("/api/register", {
            method: "POST",
            body: JSON.stringify({ username, password, nickname }),
          });
          remember(r.token, r.profile);
        } catch (e) {
          setError((e as Error).message);
          throw e;
        } finally {
          setLoading(false);
        }
      },
      logout: () => {
        localStorage.removeItem("brc-token");
        setToken(null);
        setProfile(null);
        setRoom(null);
        setView(null);
        sock.current.disconnect();
      },
      clearError: () => setError(null),
      dismissToast: (id) => setToasts((t) => t.filter((x) => x.id !== id)),
    }),
    [profile, token, room, view, status, toasts, error, loading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGame() {
  const v = useContext(Ctx);
  if (!v) throw new Error("GameProvider missing");
  return v;
}

export function useChat(): ChatMessage[] {
  const { room } = useGame();
  return room?.chat ?? [];
}
