import { ANIMAL_LIST } from "@game/animals";
import { COSMETICS, xpForLevel } from "@game/balance";
import { MODE_INFO } from "@game/protocol";
import { matchupLabel } from "@game/matchups";
import { useEffect, useState } from "react";
import { AnimalArt } from "../components/AnimalArt";
import { api } from "../net";
import { isMuted, isReducedMotion, setMuted, setReducedMotion } from "../audio";
import { useGame } from "../state";
import type { LeaderboardRow, PlayerProfile } from "@game/types";

export function RosterPage() {
  return (
    <div className="page">
      <h2>Complete roster</h2>
      <div className="animal-grid">
        {ANIMAL_LIST.map((a) => {
          const mu = matchupLabel(a.id);
          return (
            <article className="card" key={a.id}>
              <AnimalArt id={a.id} />
              <h3>{a.name}</h3>
              <p className="muted">{a.role} · beats {mu.beats} · soft vs {mu.loses}</p>
              <div className="stat-row">
                <span>HP {a.hp}</span><span>ATK {a.attack}</span><span>DEF {a.defense}</span><span>SPD {a.speed}</span>
              </div>
              <p><strong>{a.special}</strong> ({a.energyCost} EN, CD {a.cooldown})</p>
              <p className="muted">{a.specialDescription}</p>
              <p className="muted">{a.strengths}</p>
              <p className="muted">{a.weaknesses}</p>
              <p className="muted">Evolution: {a.evolution}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function ModesPage() {
  return (
    <div className="page">
      <h2>Game modes</h2>
      <div className="grid grid-3">
        {Object.entries(MODE_INFO).map(([id, m]) => (
          <article className="card" key={id}>
            <h3>{m.name}</h3>
            <p>{m.blurb}</p>
            <p className="muted">{m.min}–{m.max} players</p>
          </article>
        ))}
      </div>
    </div>
  );
}

export function HowToPlay() {
  return (
    <div className="page card">
      <h2>Laws of the wild</h2>
      <ol>
        <li>Moves are chosen in secret and lock before the round resolves.</li>
        <li>The server, not your browser, decides damage, loot, and winners.</li>
        <li>Final damage = Base × (1 − Defense × 0.04), Defense reduction capped at 60%.</li>
        <li>Defend doubles Defense. Recover heals 15 and restores 20 energy but halves Defense.</li>
        <li>Poison, Burn, Bleed, and the shrinking zone ignore Defense.</li>
        <li>Cheetah Sprint always acts first. Ties break on the server.</li>
        <li>Alliances hide nothing from each other — until someone betrays (+25% surprise).</li>
        <li>Evolve after 3 kills or 5 rounds survived. Haunt once after death.</li>
      </ol>
    </div>
  );
}

export function LeaderboardPage() {
  const [sort, setSort] = useState<"wins" | "kills" | "xp">("wins");
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  useEffect(() => {
    api<{ rows: LeaderboardRow[] }>(`/api/leaderboard?sort=${sort}`).then((r) => setRows(r.rows)).catch(() => setRows([]));
  }, [sort]);
  return (
    <div className="page card">
      <h2>Leaderboard</h2>
      <div className="cta-row">
        {(["wins", "kills", "xp"] as const).map((s) => (
          <button key={s} className={`btn ${sort === s ? "btn-gold" : "btn-ghost"}`} onClick={() => setSort(s)}>{s}</button>
        ))}
      </div>
      <table className="table">
        <thead><tr><th>Hunter</th><th>Wins</th><th>Kills</th><th>XP</th><th>Lv</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.playerId}><td>{r.nickname}</td><td>{r.wins}</td><td>{r.kills}</td><td>{r.xp}</td><td>{r.level}</td></tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="muted">No ranked hunters yet. Register and win a clash.</p>}
    </div>
  );
}

export function ProfilePage() {
  const { profile, token } = useGame();
  const [nick, setNick] = useState(profile?.nickname ?? "");
  const [full, setFull] = useState<PlayerProfile | null>(profile);
  useEffect(() => {
    if (!token) return;
    api<{ profile: PlayerProfile }>("/api/me").then((r) => setFull(r.profile)).catch(() => {});
  }, [token]);
  if (!full) return <div className="page">Sign in from Play to track progression. Guests keep a local session only.</div>;
  const next = xpForLevel(full.stats.level + 1);
  return (
    <div className="page card">
      <h2>{full.nickname}</h2>
      <p>{full.stats.equippedTitle} · Level {full.stats.level} · {full.stats.xp} XP (next {next})</p>
      <div className="bar"><span className="en" style={{ width: `${Math.min(100, (full.stats.xp / next) * 100)}%` }} /></div>
      <ul>
        <li>Matches {full.stats.matchesPlayed}</li>
        <li>Wins {full.stats.wins} / Losses {full.stats.losses}</li>
        <li>Kills {full.stats.kills}</li>
        <li>Streak {full.stats.winStreak} (best {full.stats.bestWinStreak})</li>
      </ul>
      <h3>Daily challenges</h3>
      {full.challenges.map((c) => (
        <p key={c.id}>{c.title} — {c.progress}/{c.target} {c.completed ? "✓" : ""}</p>
      ))}
      <h3>Cosmetics (no stat power)</h3>
      {COSMETICS.map((c) => (
        <span key={c.id} className="pill">{c.name} {full.stats.cosmetics.includes(c.id) ? "unlocked" : `at ${c.xp} XP`}</span>
      ))}
      <h3>Display name</h3>
      <form
        className="chat-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await api<{ profile: PlayerProfile; token: string }>("/api/profile/nickname", {
            method: "POST",
            body: JSON.stringify({ nickname: nick }),
          });
          localStorage.setItem("brc-token", r.token);
          setFull(r.profile);
        }}
      >
        <input value={nick} onChange={(e) => setNick(e.target.value)} />
        <button className="btn btn-gold btn-small">Save</button>
      </form>
    </div>
  );
}

export function SettingsPage() {
  const [mute, setMute] = useState(isMuted());
  const [motion, setMotion] = useState(isReducedMotion());
  return (
    <div className="page card">
      <h2>Settings & accessibility</h2>
      <label>
        <input type="checkbox" checked={mute} onChange={(e) => { setMute(e.target.checked); setMuted(e.target.checked); }} /> Mute sound
      </label>
      <label>
        <input type="checkbox" checked={motion} onChange={(e) => { setMotion(e.target.checked); setReducedMotion(e.target.checked); }} /> Reduced motion (no screen shake)
      </label>
      <p className="muted">Keyboard: Tab through actions, Enter to activate. Contrast uses gold on deep forest green.</p>
    </div>
  );
}
