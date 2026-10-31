import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useGame } from "../state";

export function PlayGate() {
  const { profile, guest, login, register, loading, error } = useGame();
  const nav = useNavigate();
  const location = useLocation();
  const next = new URLSearchParams(location.search).get("next");
  const returnTo = next?.startsWith("/") && !next.startsWith("//") ? next : "/create";
  const [nickname, setNickname] = useState(profile?.nickname ?? "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"guest" | "login" | "register">("guest");

  useEffect(() => {
    if (profile && next) nav(returnTo, { replace: true });
  }, [profile, next, returnTo, nav]);

  if (profile) {
    return (
      <div className="page">
        <div className="card">
          <h2>Welcome, {profile.nickname}</h2>
          <p className="muted">{profile.isGuest ? "Guest hunter — stats will not persist across devices." : `Level ${profile.stats.level}`}</p>
          <div className="cta-row">
            <Link className="btn btn-gold" to="/create">Create Room</Link>
            <Link className="btn btn-mint" to="/join">Join Room</Link>
            <Link className="btn btn-ghost" to="/leaderboard">Leaderboard</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="card" style={{ maxWidth: 460 }}>
        <h2>Enter the wild</h2>
        <p className="muted">Play as a guest instantly, or create an account for XP, cosmetics, and leaderboards.</p>
        <div className="cta-row">
          <button className={`btn ${mode === "guest" ? "btn-gold" : "btn-ghost"}`} onClick={() => setMode("guest")}>Guest</button>
          <button className={`btn ${mode === "login" ? "btn-gold" : "btn-ghost"}`} onClick={() => setMode("login")}>Sign in</button>
          <button className={`btn ${mode === "register" ? "btn-gold" : "btn-ghost"}`} onClick={() => setMode("register")}>Register</button>
        </div>
        {mode !== "login" && (
          <label>
            Nickname
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={18} />
          </label>
        )}
        {mode !== "guest" && (
          <>
            <label>
              Username
              <input value={username} onChange={(e) => setUsername(e.target.value)} />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
          </>
        )}
        {error && <p className="muted">{error}</p>}
        <div className="cta-row">
          <button
            className="btn btn-gold"
            disabled={loading}
            onClick={async () => {
              try {
                if (mode === "guest") await guest(nickname || "Hunter");
                if (mode === "login") await login(username, password);
                if (mode === "register") await register(username, password, nickname || username);
                nav(returnTo, { replace: true });
              } catch {
                /* error banner */
              }
            }}
          >
            {loading ? "Connecting…" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
