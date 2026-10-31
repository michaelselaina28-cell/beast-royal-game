import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ErrorBoundary } from "./ErrorBoundary";
import { NavBar, Toasts } from "./components/Ui";
import { Home } from "./pages/Home";
import { PlayGate } from "./pages/Identity";
import { MatchPage, ResultsPage } from "./pages/Match";
import { HowToPlay, LeaderboardPage, ModesPage, ProfilePage, RosterPage, SettingsPage } from "./pages/Meta";
import { CreateRoom, JoinRoom, LobbyPage } from "./pages/Rooms";
import { useGame } from "./state";

function ErrorBanner() {
  const { error, clearError } = useGame();
  if (!error) return null;
  return (
    <div className="card" style={{ margin: "12px auto", width: "min(1180px, calc(100% - 24px))", borderColor: "var(--coral)" }}>
      <strong>Notice:</strong> {error}{" "}
      <button className="btn btn-small btn-ghost" onClick={clearError}>Dismiss</button>
    </div>
  );
}

export default function App() {
  const loc = useLocation();
  return (
    <div className="shell">
      <NavBar />
      <ErrorBanner />
      <ErrorBoundary>
      <main key={loc.pathname}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/play" element={<PlayGate />} />
          <Route path="/create" element={<CreateRoom />} />
          <Route path="/join" element={<JoinRoom />} />
          <Route path="/join/:code" element={<JoinRoom />} />
          <Route path="/room/:code" element={<LobbyPage />} />
          <Route path="/match" element={<MatchPage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/roster" element={<RosterPage />} />
          <Route path="/modes" element={<ModesPage />} />
          <Route path="/how-to-play" element={<HowToPlay />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      </ErrorBoundary>
      <Toasts />
    </div>
  );
}
