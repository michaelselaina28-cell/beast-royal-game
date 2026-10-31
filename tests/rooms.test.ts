import { afterEach, describe, expect, it } from "vitest";
import { canStart, closeRoom, createRoom, joinRoom, selectAnimal, setReady, startMatch } from "../server/rooms";

const roomIds: string[] = [];

afterEach(() => {
  for (const id of roomIds.splice(0)) closeRoom(id);
});

function makeRoom(settings: Parameters<typeof createRoom>[2] = {}) {
  const live = createRoom(`host-${Math.random()}`, "Host", settings);
  roomIds.push(live.room.id);
  return live;
}

describe("room lifecycle", () => {
  it("rejects starting until enough players select beasts and ready up", () => {
    const live = makeRoom();
    expect(canStart(live)).toBe("Need at least 2 players.");
    expect(startMatch(live.room.hostId)).toMatchObject({ ok: false, error: "Need at least 2 players." });

    const joined = joinRoom(live.room.code, "guest-player", "Guest");
    expect(joined.ok).toBe(true);
    selectAnimal(live.room.hostId, "lion");
    selectAnimal("guest-player", "tiger");
    setReady(live.room.hostId, true);
    expect(canStart(live)).toBe("Every fighter must ready up.");
    setReady("guest-player", true);

    expect(canStart(live)).toBeNull();
    expect(startMatch(live.room.hostId)).toMatchObject({ ok: true });
    expect(live.room.status).toBe("in_match");
  });

  it("rejects fighter joins when full instead of silently turning them into spectators", () => {
    const live = makeRoom({ maxPlayers: 2, spectatorsAllowed: true });
    expect(joinRoom(live.room.code, "guest-player", "Guest").ok).toBe(true);
    expect(joinRoom(live.room.code, "third-player", "Third")).toMatchObject({
      ok: false,
      error: "This den is full.",
    });
  });

  it("requires explicit spectator selection after a match starts", () => {
    const live = makeRoom();
    joinRoom(live.room.code, "guest-player", "Guest");
    selectAnimal(live.room.hostId, "lion");
    selectAnimal("guest-player", "tiger");
    setReady(live.room.hostId, true);
    setReady("guest-player", true);
    startMatch(live.room.hostId);

    expect(joinRoom(live.room.code, "spectator-player", "Spectator")).toMatchObject({
      ok: false,
      error: "The match already started. Select spectator to watch.",
    });
    expect(joinRoom(live.room.code, "spectator-player", "Spectator", true).ok).toBe(true);
  });
});