import { ANIMALS } from "@game/animals";
import { EMOTES } from "@game/balance";
import type { ActionType, Terrain } from "@game/types";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimalArt } from "../components/AnimalArt";
import { Arena } from "../components/Arena";
import { Bars } from "../components/Ui";
import { sfx } from "../audio";
import { useGame } from "../state";

const ACTIONS: { type: ActionType; label: string; icon: string; hint: string }[] = [
  { type: "quick", label: "Quick Strike", icon: "⚔", hint: "0 EN · 80% ATK" },
  { type: "heavy", label: "Heavy Attack", icon: "⚔", hint: "20 EN · 140% ATK" },
  { type: "defend", label: "Defend", icon: "▣", hint: "Double Defense" },
  { type: "recover", label: "Recover", icon: "+", hint: "+15 HP +20 EN" },
  { type: "special", label: "Special", icon: "✦", hint: "Unique ability" },
  { type: "grab_crate", label: "Grab Crate", icon: "□", hint: "Contest loot" },
  { type: "move", label: "Move", icon: "➤", hint: "Change terrain" },
];

export function MatchPage() {
  const { view, room, send, profile, status } = useGame();
  const nav = useNavigate();
  const [type, setType] = useState<ActionType>("quick");
  const [targetId, setTarget] = useState<string>();
  const [zone, setZone] = useState<Terrain>("center");
  const [chat, setChat] = useState("");
  const [shake, setShake] = useState(false);
  const [hitFlash, setHitFlash] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    const i = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    if (room?.status === "lobby") nav(`/room/${room.code}`);
    if (view?.match.phase === "ended") nav("/results");
  }, [room, view, nav]);

  useEffect(() => {
    if (view?.match.recap?.lines.some((l) => l.kind === "damage")) {
      setShake(true);
      setHitFlash(true);
      sfx("hit");
      const t = setTimeout(() => {
        setShake(false);
        setHitFlash(false);
      }, 420);
      return () => clearTimeout(t);
    }
  }, [view?.match.round, view?.match.phase]);

  const match = view?.match;
  const me = match?.combatants.find((c) => c.playerId === view?.myId);
  const left = match ? Math.max(0, Math.ceil((match.decisionEndsAt - Date.now()) / 1000)) : 0;
  const timeLeft = match?.mode === "time" && match.matchEndsAt ? Math.max(0, Math.ceil((match.matchEndsAt - Date.now()) / 1000)) : undefined;
  const locked = !!view?.privateAction?.locked;
  const spectating = !me || me.eliminated || room?.members.find((m) => m.playerId === profile?.id)?.isSpectator;

  const targets = useMemo(() => {
    if (!match || !me) return [];
    return match.combatants.filter((c) => !c.eliminated && c.playerId !== me.playerId);
  }, [match, me]);

  if (!match || !view) {
    const recovering = status === "connecting" || status === "lost";
    return (
      <div className="page">
        <section className="match-empty">
          <span className="match-empty-icon" aria-hidden>⚔</span>
          <div className="kicker">{recovering ? "Reconnecting" : "No active match"}</div>
          <h2>{recovering ? "Restoring the clash" : "The arena is waiting"}</h2>
          <p className="muted">
            {recovering
              ? "The game server is reconnecting. Your match state will appear when the connection is restored."
              : room?.status === "lobby"
                ? "Your room is still in the lobby. Return there to choose a beast and start the fight."
                : "This match is no longer available, which can happen after a server restart. Create a fresh room to play again."}
          </p>
          <div className="cta-row">
            {room?.status === "lobby" && <Link className="btn btn-gold" to={`/room/${room.code}`}>Return to room</Link>}
            <Link className="btn btn-gold" to="/create">Create a fight</Link>
            <Link className="btn btn-ghost" to="/play">Play menu</Link>
          </div>
        </section>
      </div>
    );
  }

  const animal = me ? ANIMALS[me.animalId] : null;
  const specialDisabled = me ? me.energy < (animal?.energyCost ?? 0) || me.cooldown > 0 : true;

  function submit(nextType = type, extra?: { targetId?: string; zone?: Terrain }) {
    const actionId = `${view!.myId}-${match!.round}-${Date.now()}`;
    send({
      t: "submit_action",
      action: {
        actionId,
        type: nextType,
        targetId: extra?.targetId ?? targetId,
        zone: extra?.zone ?? zone,
      },
    });
  }

  return (
    <div className={`page ${shake ? "shake" : ""}`}>
      <div className="hud">
        <div>
          <div className="kicker">Round {match.round} · {match.phase}</div>
          <div className="timer">
            {match.mode === "time" && timeLeft !== undefined ? `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, "0")}` : match.phase === "select" ? `${left}s` : match.phase}
          </div>
        </div>
        <div>
          <div>Weather {match.weather}</div>
          <div className="muted">{match.combatants.filter((c) => !c.eliminated && !c.isBoss).length} alive</div>
          {match.bountyPlayerId && <div className="badge">Bounty marked</div>}
        </div>
        {me && animal && (
          <div>
            <strong>{me.nickname}</strong> the {animal.name} {me.evolved ? "✦ Evolved" : ""}
            <Bars hp={me.hp} maxHp={me.maxHp} energy={me.energy} maxEnergy={me.maxEnergy} />
          </div>
        )}
      </div>

      <div className="match-layout">
        <section className="card">
          {match.combatants.map((c) => {
            const hide = view.hiddenHp.includes(c.playerId);
            return (
              <div className={`player-row ${hitFlash ? "hit-flash" : ""}`} key={c.playerId}>
                <AnimalArt id={c.animalId} size={48} />
                <div style={{ flex: 1 }}>
                  <strong>{c.nickname}</strong> {c.isBoss ? "· BOSS" : ""} {match.bountyPlayerId === c.playerId ? "★" : ""}
                  {c.teamId ? ` · ${c.teamId}` : ""} {c.eliminated ? " · down" : ""}
                  <Bars hp={hide ? -1 : c.hp} maxHp={c.maxHp} energy={c.energy} maxEnergy={c.maxEnergy} />
                  <div className="status-icons">
                    {c.statuses.map((s) => (
                      <span className="badge" key={s.id}>{s.id} {s.duration}</span>
                    ))}
                  </div>
                </div>
                {!spectating && c.playerId !== me?.playerId && !c.eliminated && match.mode === "classic" && (
                  <button className="btn btn-small btn-ghost" onClick={() => send({ t: "offer_ally", targetId: c.playerId })}>Truce</button>
                )}
              </div>
            );
          })}
          {match.alliances.filter((a) => !a.active && a.offeredBy && a.offeredBy !== view.myId).map((a) => (
            <div key={a.a + a.b} className="cta-row">
              <span>Truce offer</span>
              <button className="btn btn-small btn-gold" onClick={() => send({ t: "respond_ally", fromId: a.offeredBy!, accept: true })}>Accept</button>
              <button className="btn btn-small btn-ghost" onClick={() => send({ t: "respond_ally", fromId: a.offeredBy!, accept: false })}>Decline</button>
            </div>
          ))}
        </section>

        <section>
          <Arena match={match} selected={zone} onPick={(z) => { setZone(z); if (type === "move") submit("move", { zone: z }); }} />
          {spectating ? (
            <div className="card">
              <h3>Spectator</h3>
              <p className="muted">You watch the remaining hunt.{me && !me.lastStandUsed ? " You may haunt once." : ""}</p>
              {me && me.eliminated && !me.lastStandUsed && (
                <div className="targets">
                  {targets.filter((t) => !t.isBoss).map((t) => (
                    <button key={t.playerId} className="btn btn-danger btn-small" onClick={() => send({ t: "last_stand", targetId: t.playerId, actionId: `ls-${Date.now()}` })}>
                      Haunt {t.nickname}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="card">
              <div className="actions">
                {ACTIONS.map((a) => {
                  const disabled =
                    locked ||
                    (a.type === "heavy" && (me?.energy ?? 0) < 20) ||
                    (a.type === "special" && specialDisabled);
                  return (
                    <button
                      key={a.type}
                      disabled={disabled}
                      className={`action-btn ${type === a.type ? "on" : ""}`}
                      title={a.type === "special" && animal ? `${animal.special}: ${animal.specialDescription}` : a.hint}
                      onClick={() => {
                        setType(a.type);
                        submit(a.type);
                      }}
                    >
                      <span className="action-icon" aria-hidden>{a.icon}</span>
                      <span className="action-copy">
                        <strong>{a.type === "special" && animal ? animal.special : a.label}</strong>
                        <span className="muted">{a.type === "special" && animal ? `${animal.energyCost} EN · CD ${me?.cooldown}` : a.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="targets">
                {targets.map((t) => (
                  <button key={t.playerId} className={`btn btn-small ${targetId === t.playerId ? "btn-gold" : "btn-ghost"}`} onClick={() => { setTarget(t.playerId); submit(type, { targetId: t.playerId }); }}>
                    {t.nickname}
                  </button>
                ))}
              </div>
              {view.allyMoves.map((m) => (
                <p key={m.playerId} className="muted">Ally move: {m.type}</p>
              ))}
              <button
                className="btn btn-gold"
                disabled={locked || match.phase !== "select"}
                onClick={() => {
                  sfx("lock");
                  send({ t: "lock_action" });
                }}
              >
                {locked ? "Locked" : "Lock Move"}
              </button>
            </div>
          )}
        </section>

        <aside className="card">
          <h3>Battle log</h3>
          <div className="log">
            {(match.recap?.lines ?? match.log.slice(-12)).map((l) => (
              <div key={l.id}>{l.text}</div>
            ))}
          </div>
          <div className="emotes">
            {EMOTES.map((e) => (
              <button key={e.id} className="btn btn-small btn-ghost" onClick={() => send({ t: "chat", text: e.label, channel: spectating ? "spectator" : "match", emote: e.glyph })}>
                {e.glyph}
              </button>
            ))}
          </div>
          <form
            className="chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              send({ t: "chat", text: chat, channel: spectating ? "spectator" : "match" });
              setChat("");
            }}
          >
            <input value={chat} onChange={(e) => setChat(e.target.value)} placeholder={spectating ? "Spectator chat" : "Match chat"} />
            <button className="btn btn-mint btn-small">Send</button>
          </form>
        </aside>
      </div>
    </div>
  );
}

export function ResultsPage() {
  const { view, room, send, profile } = useGame();
  const nav = useNavigate();
  const match = view?.match;
  if (!match) return <div className="page">No result yet.</div>;
  const winners = new Set(match.winnerIds);
  const host = room?.hostId === profile?.id;

  return (
    <div className="page">
      <div className="card">
        <h2>
          {match.result === "draw" ? "Draw — the wild claims all" : match.result === "boss_fail" ? "Raid failed" : match.result === "boss_win" ? "Titan down" : "Victory"}
        </h2>
        <table className="table">
          <thead>
            <tr><th>Hunter</th><th>Beast</th><th>Kills</th><th>Damage</th><th></th></tr>
          </thead>
          <tbody>
            {match.combatants.filter((c) => !c.isBoss).map((c) => (
              <tr key={c.playerId}>
                <td>{c.nickname} {winners.has(c.playerId) ? "♛" : ""}</td>
                <td>{ANIMALS[c.animalId].name}</td>
                <td>{c.kills}</td>
                <td>{c.damageDealt}</td>
                <td>#{c.placement ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="cta-row">
          {host && <button className="btn btn-gold" onClick={() => { send({ t: "rematch" }); nav(room ? `/room/${room.code}` : "/play"); }}>Rematch</button>}
          <button className="btn btn-mint" onClick={() => { send({ t: "return_lobby" }); nav(room ? `/room/${room.code}` : "/play"); }}>Return to lobby</button>
        </div>
      </div>
    </div>
  );
}
