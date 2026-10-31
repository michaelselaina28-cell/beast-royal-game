import { NavLink } from "react-router-dom";
import { useGame } from "../state";

export function NavBar() {
  const { profile, status, view, logout } = useGame();
  const matchActive = !!view && view.match.phase !== "ended";
  return (
    <header className="nav">
      <NavLink to="/" className="brand">
        <strong aria-hidden>🦁</strong>
        <h1>Beast Royale Clash</h1>
      </NavLink>
      <nav className="nav-links">
        <NavLink to="/play">Play</NavLink>
        {matchActive && (
          <NavLink className="nav-return" to="/match">
            <span aria-hidden>⚔</span> Return to match
          </NavLink>
        )}
        <NavLink to="/roster">Roster</NavLink>
        <NavLink to="/modes">Modes</NavLink>
        <NavLink to="/how-to-play">How to Play</NavLink>
        <NavLink to="/leaderboard">Leaders</NavLink>
        <NavLink to="/profile">Profile</NavLink>
        <NavLink to="/settings">Settings</NavLink>
        {profile ? (
          <button className="linkish" onClick={logout}>
            Sign out
          </button>
        ) : null}
      </nav>
      <span className={`conn ${status}`}>
        {status === "live" ? "Live" : status === "connecting" ? "Connecting…" : status === "lost" ? "Reconnecting…" : "Offline"}
      </span>
    </header>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useGame();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} className={`toast ${t.kind}`} onClick={() => dismissToast(t.id)}>
          {t.message}
        </button>
      ))}
    </div>
  );
}

export function Bars({ hp, maxHp, energy, maxEnergy }: { hp: number; maxHp: number; energy: number; maxEnergy: number }) {
  const hidden = hp < 0;
  return (
    <div className="bars">
      <div className="bar" title="Health">
        <span className="hp" style={{ width: hidden ? "100%" : `${Math.max(0, (hp / maxHp) * 100)}%`, opacity: hidden ? 0.2 : 1 }} />
      </div>
      <div className="bar" title="Energy">
        <span className="en" style={{ width: `${Math.max(0, (energy / maxEnergy) * 100)}%` }} />
      </div>
      <small className="muted">{hidden ? "Hidden" : `${hp}/${maxHp} HP · ${energy} EN`}</small>
    </div>
  );
}
