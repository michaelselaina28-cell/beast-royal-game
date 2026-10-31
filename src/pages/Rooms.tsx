import { MODE_INFO } from "@game/protocol";
import type { GameMode, RoomSettings } from "@game/types";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AnimalArt } from "../components/AnimalArt";
import { ANIMAL_LIST } from "@game/animals";
import { useGame } from "../state";
import { matchupLabel } from "@game/matchups";

export function CreateRoom() {
  const { profile, request, room, status } = useGame();
  const nav = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<GameMode>("classic");
  const [maxPlayers, setMax] = useState(8);
  const [spectatorsAllowed, setSpec] = useState(true);
  const [bossKind, setBoss] = useState<"mammoth" | "trex">("mammoth");
  const [teamSize, setTeam] = useState<2 | 4>(2);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const creatingRef = useRef(false);

  useEffect(() => {
    if (room) nav(`/room/${room.code}`);
  }, [room, nav]);
  useEffect(() => {
    if (!profile) nav(`/play?next=${encodeURIComponent(location.pathname + location.search)}`, { replace: true });
  }, [profile, location.pathname, location.search, nav]);

  if (!profile) return null;

  async function create() {
    if (creatingRef.current || status !== "live") return;
    creatingRef.current = true;
    setCreating(true);
    setCreateError("");
    try {
      const result = await request({
        t: "create_room",
        settings: {
          mode,
          maxPlayers,
          spectatorsAllowed,
          bossKind,
          teamSize: mode === "team" ? teamSize : 0,
          uniqueAnimals: mode !== "boss",
        },
      });
      if (!result.room?.code) throw new Error("The server confirmed the request without returning a room code.");
    } catch (error) {
      setCreateError((error as Error).message);
      creatingRef.current = false;
      setCreating(false);
    }
  }

  return (
    <div className="page">
      <div className="card">
        <h2>Create a den</h2>
        <label>
          Mode
          <select value={mode} onChange={(e) => setMode(e.target.value as GameMode)}>
            {Object.entries(MODE_INFO).map(([id, m]) => (
              <option key={id} value={id}>{m.name}</option>
            ))}
          </select>
        </label>
        <p className="muted">{MODE_INFO[mode].blurb}</p>
        <label>
          Max players
          <input type="number" min={2} max={8} value={maxPlayers} onChange={(e) => setMax(Number(e.target.value))} />
        </label>
        {mode === "team" && (
          <label>
            Team format
            <select value={teamSize} onChange={(e) => setTeam(Number(e.target.value) as 2 | 4)}>
              <option value={2}>2v2</option>
              <option value={4}>4v4</option>
            </select>
          </label>
        )}
        {mode === "boss" && (
          <label>
            Titan
            <select value={bossKind} onChange={(e) => setBoss(e.target.value as "mammoth" | "trex")}>
              <option value="mammoth">Mammoth Colossus</option>
              <option value="trex">Tyrant Rex</option>
            </select>
          </label>
        )}
        <label>
          <input type="checkbox" checked={spectatorsAllowed} onChange={(e) => setSpec(e.target.checked)} /> Allow spectators
        </label>
        <button
          className="btn btn-gold"
          disabled={status !== "live" || creating}
          onClick={create}
        >
          {creating ? "Creating room…" : status === "live" ? "Create room" : "Connecting…"}
        </button>
        {createError && <p className="form-error" role="alert">{createError}</p>}
        {status !== "live" && <p className="muted">The game server is connecting. Room creation will unlock when it is live.</p>}
      </div>
    </div>
  );
}

export function JoinRoom() {
  const { request, room, profile, status } = useGame();
  const nav = useNavigate();
  const params = useParams();
  const location = useLocation();
  const [code, setCode] = useState(params.code ?? "");
  const [spectator, setSpec] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const joiningRef = useRef(false);

  useEffect(() => {
    if (params.code) setCode(params.code);
  }, [params.code]);
  useEffect(() => {
    if (room && room.code === code.trim().toUpperCase()) nav(`/room/${room.code}`);
  }, [room, code, nav]);
  useEffect(() => {
    if (!profile) nav(`/play?next=${encodeURIComponent(location.pathname + location.search)}`, { replace: true });
  }, [profile, location.pathname, location.search, nav]);

  if (!profile) return null;

  async function join() {
    if (joiningRef.current || status !== "live" || !code.trim()) return;
    joiningRef.current = true;
    setJoining(true);
    setJoinError("");
    try {
      await request({ t: "join_room", code: code.trim().toUpperCase(), spectator });
    } catch (error) {
      setJoinError((error as Error).message);
      joiningRef.current = false;
      setJoining(false);
    }
  }

  return (
    <div className="page">
      <div className="card">
        <h2>Join a den</h2>
        <label>
          Room code
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="BEAST-7294" />
        </label>
        <label>
          <input type="checkbox" checked={spectator} onChange={(e) => setSpec(e.target.checked)} /> Join as spectator
        </label>
        <button className="btn btn-gold" disabled={status !== "live" || !code.trim() || joining} onClick={join}>
          {joining ? "Joining room…" : status === "live" ? "Join room" : "Connecting…"}
        </button>
        {joinError && <p className="form-error" role="alert">{joinError}</p>}
        {status !== "live" && <p className="muted">The game server is connecting. Joining will unlock when it is live.</p>}
      </div>
    </div>
  );
}

export function LobbyPage() {
  const { room, send, request, profile, status } = useGame();
  const nav = useNavigate();
  const [chat, setChat] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [readyPending, setReadyPending] = useState(false);
  const [startPending, setStartPending] = useState(false);
  const [roomError, setRoomError] = useState("");
  const readyRef = useRef(false);
  const startRef = useRef(false);

  useEffect(() => {
    if (room?.status === "in_match") nav("/match");
    if (room?.status === "ended") nav("/results");
  }, [room, nav]);

  if (!room || !profile) return <div className="page">Looking for the den…</div>;
  const me = room.members.find((m) => m.playerId === profile.id);
  const host = room.hostId === profile.id;
  const taken = new Set(room.members.map((m) => m.animalId));
  const share = `${window.location.origin}/join/${room.code}`;
  const fighters = room.members.filter((member) => !member.isSpectator);
  const teamPlayers = room.settings.teamSize === 4 ? 8 : 4;
  const needsAnimal = room.settings.mode !== "draft" && room.settings.mode !== "boss";
  let startBlocker: string | null = null;
  if (room.settings.mode === "team" && fighters.length < teamPlayers) {
    startBlocker = `Waiting for ${teamPlayers - fighters.length} more fighter${teamPlayers - fighters.length === 1 ? "" : "s"} for Team Battle.`;
  } else if (room.settings.mode === "team" && fighters.length > teamPlayers) {
    startBlocker = `Team Battle needs exactly ${teamPlayers} fighters.`;
  } else if (fighters.length > room.settings.maxPlayers) {
    startBlocker = `This mode allows at most ${room.settings.maxPlayers} fighters.`;
  } else if (fighters.length < room.settings.minPlayers) {
    startBlocker = `Waiting for ${room.settings.minPlayers - fighters.length} more fighter${room.settings.minPlayers - fighters.length === 1 ? "" : "s"}.`;
  } else if (needsAnimal && fighters.some((fighter) => !fighter.animalId)) {
    startBlocker = "Each fighter needs to choose a beast.";
  } else if (fighters.some((fighter) => !fighter.ready)) {
    startBlocker = "Waiting for every fighter to ready up.";
  }
  const startReady = !startBlocker && status === "live";

  async function copyInvite(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyMessage(`${label} copied.`);
    } catch {
      setCopyMessage(`${label} could not be copied. Select the matching field below to copy it manually.`);
    }
  }

  async function setReady(ready: boolean) {
    if (readyRef.current || status !== "live") return;
    readyRef.current = true;
    setReadyPending(true);
    setRoomError("");
    try {
      await request({ t: "set_ready", ready });
    } catch (error) {
      setRoomError((error as Error).message);
    } finally {
      readyRef.current = false;
      setReadyPending(false);
    }
  }

  async function startMatch() {
    if (startRef.current || !startReady) return;
    startRef.current = true;
    setStartPending(true);
    setRoomError("");
    try {
      const result = await request({ t: "start_match" });
      if (result.room?.status !== "in_match") throw new Error("The server did not confirm that the match started.");
    } catch (error) {
      setRoomError((error as Error).message);
    } finally {
      startRef.current = false;
      setStartPending(false);
    }
  }

  return (
    <div className="page">
      <div className="lobby">
        <section className="card">
          <div className="hud">
            <div>
              <div className="kicker">Room</div>
              <h2>{room.code}</h2>
              <p className="muted">{MODE_INFO[room.settings.mode].name}</p>
            </div>
            <div className="cta-row">
              <button className="btn btn-mint btn-small" onClick={() => copyInvite(room.code, "Room code")}>Copy code</button>
              <button className="btn btn-ghost btn-small" onClick={() => copyInvite(share, "Invite link")}>Copy invite link</button>
            </div>
          </div>
          <div className="invite-panel">
            <div>
              <span className="kicker">Invite your fighters</span>
              <input className="invite-copy-field invite-code" aria-label="Room code to copy manually" readOnly value={room.code} onFocus={(event) => event.currentTarget.select()} />
              <a className="invite-open-link" href={share}>Open invite link</a>
              <input className="invite-copy-field invite-url" aria-label="Invite link to copy manually" readOnly value={share} onFocus={(event) => event.currentTarget.select()} />
              {copyMessage && <span className="copy-feedback" role="status">{copyMessage}</span>}
            </div>
            <div className="invite-count">{fighters.length} / {room.settings.maxPlayers} fighters</div>
          </div>
          {host && (
            <label>
              Mode
              <select
                value={room.settings.mode}
                onChange={(e) => send({ t: "set_settings", settings: { mode: e.target.value as GameMode } })}
              >
                {Object.entries(MODE_INFO).map(([id, m]) => (
                  <option key={id} value={id}>{m.name}</option>
                ))}
              </select>
            </label>
          )}
          <h3>Hunters</h3>
          {room.members.map((m) => (
            <div className="player-row" key={m.playerId}>
              {m.animalId ? <AnimalArt id={m.animalId} size={48} /> : <div className="portrait" />}
              <div>
                <strong>{m.nickname}</strong> {m.isHost ? "· Host" : ""} {m.isSpectator ? "· Spectator" : ""}
                <div className="muted">
                  {m.connected ? "Connected" : "Offline"} · {m.animalId ? ANIMAL_LIST.find((animal) => animal.id === m.animalId)?.name : "No beast selected"} · {m.ready ? "Ready" : "Not ready"}{m.teamId ? ` · Team ${m.teamId}` : ""}
                </div>
              </div>
              {host && m.playerId !== profile.id && (
                <button className="btn btn-danger btn-small" onClick={() => send({ t: "kick", playerId: m.playerId })}>Remove</button>
              )}
              {host && room.settings.mode === "team" && !m.isSpectator && (
                <select value={m.teamId ?? "a"} onChange={(e) => send({ t: "set_team", playerId: m.playerId, teamId: e.target.value as "a" | "b" })}>
                  <option value="a">Team A</option>
                  <option value="b">Team B</option>
                </select>
              )}
            </div>
          ))}
          <div className="cta-row">
            <button className="btn btn-mint" disabled={status !== "live" || readyPending} onClick={() => setReady(!me?.ready)}>
              {readyPending ? "Updating…" : me?.ready ? "Unready" : "Ready up"}
            </button>
            {host && (
              <button className="btn btn-gold" disabled={!startReady || startPending} onClick={startMatch}>
                {startPending ? "Starting match…" : startReady ? "Start match" : "Waiting to start"}
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => { send({ t: "leave_room" }); nav("/"); }}>Leave</button>
          </div>
          {host ? (
            <p className="start-hint" role="status">{startBlocker ?? "Everyone is ready. Start the match when you are."}</p>
          ) : (
            <p className="start-hint">{startBlocker ?? "Everyone is ready. Waiting for the host to start the match."}</p>
          )}
          {roomError && <p className="form-error" role="alert">{roomError}</p>}
        </section>
        <aside className="card">
          <h3>Choose your beast</h3>
          {room.settings.mode === "draft" && <p className="muted">Random Draft will assign animals when the host starts.</p>}
          <div className="animal-grid">
            {ANIMAL_LIST.map((a) => {
              const isTaken = room.settings.uniqueAnimals && taken.has(a.id) && me?.animalId !== a.id;
              const mu = matchupLabel(a.id);
              return (
                <button
                  key={a.id}
                  disabled={isTaken || me?.isSpectator}
                  className={`animal-card ${me?.animalId === a.id ? "selected" : ""} ${isTaken ? "taken" : ""}`}
                  onClick={() => send({ t: "select_animal", animalId: a.id })}
                  title={`${a.special}. Beats ${mu.beats}. Soft to ${mu.loses}.`}
                >
                  <AnimalArt id={a.id} size={56} />
                  <strong>{a.name}</strong>
                  <div className="stat-row">
                    <span className="pill">{a.role}</span>
                    <span>HP {a.hp}</span>
                    <span>ATK {a.attack}</span>
                  </div>
                  <div className="muted">{a.special} · {a.energyCost} EN</div>
                </button>
              );
            })}
          </div>
          <div className="chat">
            <div className="chat-log">
              {room.chat.filter((c) => c.channel === "lobby").map((c) => (
                <div key={c.id}><strong>{c.nickname}:</strong> {c.emote ? `${c.emote} ` : ""}{c.text}</div>
              ))}
            </div>
            <form
              className="chat-form"
              onSubmit={(e) => {
                e.preventDefault();
                send({ t: "chat", text: chat, channel: "lobby" });
                setChat("");
              }}
            >
              <input value={chat} onChange={(e) => setChat(e.target.value)} placeholder="Lobby chat" />
              <button className="btn btn-mint btn-small">Send</button>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
}
