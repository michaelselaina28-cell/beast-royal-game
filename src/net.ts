import type { ClientToServer, ServerToClient } from "@game/protocol";

type RoomRequest = Extract<ClientToServer, { t: "create_room" | "join_room" | "set_ready" | "start_match" }>;
type PendingRoomRequest = RoomRequest & { requestId: string };

interface PendingRequest {
  message: PendingRoomRequest;
  resolve: (result: Extract<ServerToClient, { t: "request_result" }>) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  sentConnection: number;
}

function apiBase() {
  return (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "";
}

function wsUrl() {
  const env = import.meta.env.VITE_WS_URL as string | undefined;
  if (env) return env;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  if (import.meta.env.DEV) return `${proto}//${location.host}/ws`;
  return `${proto}//${location.host}/ws`;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("brc-token");
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText);
  return data as T;
}

export class GameSocket {
  private ws: WebSocket | null = null;
  private retry = 0;
  private closed = false;
  private authenticated = false;
  private pending: ClientToServer[] = [];
  private connectionId = 0;
  private requests = new Map<string, PendingRequest>();
  onMessage: (msg: ServerToClient) => void = () => {};
  onStatus: (s: "off" | "connecting" | "live" | "lost") => void = () => {};

  connect() {
    if (!this.closed && this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) return;
    this.closed = false;
    this.open();
  }

  private open() {
    const connectionId = ++this.connectionId;
    this.onStatus("connecting");
    const ws = new WebSocket(wsUrl());
    this.ws = ws;
    ws.onopen = () => {
      if (connectionId !== this.connectionId) return;
      this.retry = 0;
      const token = localStorage.getItem("brc-token");
      if (token) this.send({ t: "hello", token });
      else this.onStatus("off");
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as ServerToClient;
        if (msg.t === "hello_ok") {
          this.authenticated = true;
          this.onStatus("live");
          this.flush();
        }
        if (msg.t === "request_result") {
          const pending = this.requests.get(msg.requestId);
          if (pending) {
            clearTimeout(pending.timer);
            this.requests.delete(msg.requestId);
            if (msg.ok) pending.resolve(msg);
            else pending.reject(new Error(msg.message ?? "The request could not be completed."));
          }
        }
        if (msg.t === "error" && msg.code === "auth") {
          this.authenticated = false;
          this.pending = [];
          this.closed = true;
          this.onStatus("off");
          localStorage.removeItem("brc-token");
          for (const [requestId, pending] of this.requests) {
            clearTimeout(pending.timer);
            pending.reject(new Error(msg.message));
            this.requests.delete(requestId);
          }
          ws.close(1008, "Invalid session");
        }
        this.onMessage(msg);
      } catch {
        /* ignore */
      }
    };
    ws.onclose = () => {
      if (connectionId !== this.connectionId) return;
      this.authenticated = false;
      this.onStatus(this.closed ? "off" : "lost");
      if (!this.closed && localStorage.getItem("brc-token")) {
        const wait = Math.min(8000, 400 * 2 ** this.retry++);
        setTimeout(() => this.open(), wait);
      }
    };
  }

  send(msg: ClientToServer) {
    if (this.ws?.readyState === WebSocket.OPEN && (msg.t === "hello" || this.authenticated)) {
      this.ws.send(JSON.stringify(msg));
      return;
    }
    this.pending.push(msg);
  }

  request(message: RoomRequest, timeoutMs = 12000) {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const request = { ...message, requestId } as PendingRoomRequest;
    return new Promise<Extract<ServerToClient, { t: "request_result" }>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.requests.delete(requestId);
        reject(new Error("The server did not confirm the request in time. Check your connection and try again."));
      }, timeoutMs);
      this.requests.set(requestId, { message: request, resolve, reject, timer, sentConnection: -1 });
      this.flush();
    });
  }

  private flush() {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || !this.authenticated) return;
    for (const msg of this.pending) ws.send(JSON.stringify(msg));
    this.pending = [];
    for (const request of this.requests.values()) {
      if (request.sentConnection === this.connectionId) continue;
      ws.send(JSON.stringify(request.message));
      request.sentConnection = this.connectionId;
    }
  }

  disconnect() {
    this.closed = true;
    this.connectionId += 1;
    this.authenticated = false;
    this.pending = [];
    for (const [requestId, pending] of this.requests) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Connection closed."));
      this.requests.delete(requestId);
    }
    this.onStatus("off");
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }
}
