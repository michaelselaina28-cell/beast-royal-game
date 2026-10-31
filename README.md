# Beast Royale Clash

Online multiplayer turn-based animal battle royale for 2–8 players (plus spectators). Secret simultaneous combat, shrinking wilderness, 20 original beasts, loot, alliances, weather, and five extra modes on top of Classic Last Standing.

The **Node game server is authoritative**. Browsers never decide damage, winners, loot, or room permissions.

**Go live on Render** (one public URL for the site, API, WebSocket, and file database). Netlify/Vercel are not used as the game host — they cannot keep match WebSockets alive. Leave those configs in the repo only as optional static-frontend footnotes.

## Architecture (live-ready)

- **Live host:** Render Web Service runs `npm start` (Express serves the Vite build + `/api` + `/ws`).
- **Frontend:** React + TypeScript + Vite, bundled into the same Node process in production.
- **Game backend:** Express + `ws` in `server/`.
- **Persistence:** JSON file store in `DATA_DIR` (default `./data`) for profiles, XP, leaderboards, daily challenges, match history. Optional **Supabase** schema in `supabase/migrations`.
- **Shared engine:** `shared/` used by the server and by Vitest.

## Local play

```bash
npm install
npm run dev
```

Open http://localhost:5173 — Vite proxies `/api` and `/ws` to the game server on port **8787**.

Single-process production (serves the built SPA + API + WebSocket):

```bash
npm run build
npm start
```

Then open http://localhost:8787.

## Tests and production build

```bash
npm test
npm run typecheck
npm run build
```

## Environment variables

Copy `.env.example`. Never put `GAME_JWT_SECRET` or `SUPABASE_SERVICE_ROLE_KEY` in frontend code.

| Name | Where | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | frontend build | Absolute API origin in production, e.g. `https://your-game-server.onrender.com`. Leave empty when the Node server serves the SPA. |
| `VITE_WS_URL` | frontend build | e.g. `wss://your-game-server.onrender.com/ws`. Leave empty for same-origin `/ws`. |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | frontend | Optional future Auth UI. Combat does not depend on them. |
| `PORT` | server | Default `8787`. |
| `HOST` | server | Default `0.0.0.0`. |
| `GAME_JWT_SECRET` | server | Signs player session tokens. **Change in production.** |
| `CORS_ORIGIN` | server | Frontend origin if split-hosted. |
| `PUBLIC_APP_URL` | server | Used in docs/share links. |
| `DATA_DIR` | server | JSON persistence directory. |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | server only | Optional later persistence. Never ship the service role to the browser. |
| `RATE_LIMIT_ROOM_PER_MIN` / `RATE_LIMIT_CHAT_PER_MIN` | server | Abuse controls. |

## Deploy on Render (public live link)

Do **not** deploy the game as a Vercel or Netlify app. Those hosts do not run this Express + WebSocket server.

1. Push this repo to GitHub.
2. On [render.com](https://render.com): **New → Blueprint** and select the repo (`render.yaml`), **or** **New → Web Service** and connect the repo.
3. If you create the service manually:
   - **Runtime:** Node
   - **Build command:** `npm install --include=dev && npm run build`
   - **Start command:** `npm start`
   - **Health check:** `/api/health`
4. Render injects `PORT`. Set `GAME_JWT_SECRET` to a long random value (Blueprint generates one).
5. After the first deploy, open the Render URL, e.g. `https://beast-royale-clash.onrender.com`.
6. Confirm `https://YOUR-SERVICE.onrender.com/api/health` returns `{ "ok": true, "name": "Beast Royale Clash" }`.

Leave `VITE_API_URL` and `VITE_WS_URL` empty so the browser talks to the same origin.

Free Render instances sleep after idle time. The first request after sleep can take ~30 seconds, and in-memory rooms are lost on restart. For persistent profiles/leaderboards, add a disk and point `DATA_DIR` at the mount path.

## Docker (optional)

```bash
docker build -t beast-royale-clash .
docker run -p 8787:8787 -e GAME_JWT_SECRET=change-me beast-royale-clash
```

## Netlify / Vercel

Not the live game. If you only need a marketing static copy, you would still need the Render URL for `VITE_API_URL` / `VITE_WS_URL`. The supported path is Render alone.

## Supabase (optional persistence / Auth)

1. Create a project at supabase.com.
2. SQL editor: run `supabase/migrations/0001_beast_royale.sql`.
3. Enable Email auth if you want Supabase users mapped to `profiles.user_id`.
4. Put `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the **server only**.
5. Put `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` on the frontend only if you add the JS client later.

Row Level Security denies client reads of `submitted_actions` (hidden moves). The Node server remains the combat authority even if you sync summaries to Postgres.

Abandoned rooms: delete `rooms` with `last_activity` older than 45 minutes (commented cron in the migration). The Node server already evicts idle rooms in memory.

## Documented balance defaults

Unspecified rulebook knobs live in `shared/balance.ts` (energy costs, evade chances, King of the Hill 12 points, boss HP, XP curve, weather every 3 rounds, etc.). Tune there without rewriting the resolver.

## Security notes

- Session tokens are HMAC-signed. Nicknames are labels, not identities.
- Host actions (`start_match`, `kick`, `set_settings`, `rematch`) check `hostId` on the server.
- Combat uses round-start snapshots, idempotent round keys, and private action maps that are never broadcast.
- Guests can play; registered accounts persist XP, cosmetics (no stat advantage), challenges, and leaderboard rows.
