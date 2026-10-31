import type {
  AnimalId,
  ChatMessage,
  ClientMatchView,
  GameMode,
  LeaderboardRow,
  PlayerProfile,
  RoomSettings,
  RoomState,
  SubmittedAction,
  Terrain,
} from "./types.js";

export type ClientToServer =
  | { t: "hello"; token: string }
  | { t: "create_room"; settings: Partial<RoomSettings>; requestId?: string }
  | { t: "join_room"; code: string; spectator?: boolean; requestId?: string }
  | { t: "leave_room" }
  | { t: "kick"; playerId: string }
  | { t: "set_settings"; settings: Partial<RoomSettings> }
  | { t: "select_animal"; animalId: AnimalId | null }
  | { t: "set_ready"; ready: boolean; requestId?: string }
  | { t: "set_team"; playerId: string; teamId: "a" | "b" }
  | { t: "chat"; text: string; channel: ChatMessage["channel"]; emote?: string }
  | { t: "start_match"; requestId?: string }
  | { t: "submit_action"; action: Omit<SubmittedAction, "playerId" | "locked" | "submittedAt"> & { type: SubmittedAction["type"]; targetId?: string; zone?: Terrain; actionId: string } }
  | { t: "lock_action" }
  | { t: "offer_ally"; targetId: string }
  | { t: "respond_ally"; fromId: string; accept: boolean }
  | { t: "last_stand"; targetId: string; actionId: string }
  | { t: "rematch" }
  | { t: "return_lobby" }
  | { t: "sync" };

export type ServerToClient =
  | { t: "hello_ok"; profile: PlayerProfile; token: string }
  | { t: "error"; message: string; code?: string }
  | { t: "request_result"; requestId: string; ok: boolean; message?: string; room?: RoomState }
  | { t: "room"; room: RoomState }
  | { t: "match"; view: ClientMatchView }
  | { t: "chat"; message: ChatMessage }
  | { t: "toast"; message: string; kind?: "info" | "warn" | "good" | "bad" }
  | { t: "leaderboard"; rows: LeaderboardRow[]; sort: string }
  | { t: "profile"; profile: PlayerProfile }
  | { t: "pong" };

export const MODE_INFO: Record<
  GameMode,
  { name: string; blurb: string; min: number; max: number }
> = {
  classic: {
    name: "Classic Last Standing",
    blurb: "Free-for-all. Last surviving animal wins. Simultaneous wipes draw.",
    min: 2,
    max: 8,
  },
  team: {
    name: "Team Battle",
    blurb: "2v2 or 4v4. Protect teammates, outlast the other pride.",
    min: 4,
    max: 8,
  },
  koth: {
    name: "King of the Hill",
    blurb: "Hold the center. First to the point threshold claims the crown.",
    min: 2,
    max: 8,
  },
  speed: {
    name: "Speed Mode",
    blurb: "Five-second decisions. Same laws of the wild, less time to blink.",
    min: 2,
    max: 8,
  },
  boss: {
    name: "Boss Raid",
    blurb: "Hunt a Mammoth Colossus or Tyrant Rex together. Fall as a pack or feast.",
    min: 2,
    max: 8,
  },
  draft: {
    name: "Random Draft",
    blurb: "The wild assigns your beast. No duplicates in standard draft.",
    min: 2,
    max: 8,
  },
  time: {
    name: "Time Battle",
    blurb: "Fight for five minutes. The highest score at the timer end wins.",
    min: 2,
    max: 8,
  },
};
