import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export interface TokenPayload {
  id: string;
  nickname: string;
  guest: boolean;
  iat: number;
}

function secret() {
  return process.env.GAME_JWT_SECRET || "dev-beast-royale-secret-change-me";
}

export function signToken(payload: TokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
  } catch {
    return null;
  }
}

export function newId(prefix = ""): string {
  return prefix + randomBytes(8).toString("hex");
}

export function roomCode(): string {
  const n = (Math.floor(Math.random() * 9000) + 1000).toString();
  return `BEAST-${n}`;
}
