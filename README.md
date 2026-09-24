# Hand Cricket Arena 🏏

A full rebuild of the classic gully hand-cricket game: **real-time multiplayer**,
a new **singleplayer bot mode**, **accounts backed by SQLite**, and a complete
new **React frontend** with a minimal, designer-grade UI.

## Features
- **Home → Menu flow** — landing page with your career stats, then a menu with
  three modes: *Play vs Bot*, *Create a room*, *Join a room*.
- **Singleplayer vs bot** — three difficulties (Rookie / Pro / Ruthless). The
  bot picks weighted-random shots, and on higher difficulties it reads *your*
  pick history to hunt for patterns.
- **Multiplayer with room codes** — create a room, share the 5-character code,
  your friend joins from anywhere. Full toss (even/odd + secret numbers),
  bat/bowl choice, two innings, target chases.
- **Login / signup backed by SQLite** (`better-sqlite3`, file at `data/arena.db`)
  — scrypt-hashed passwords, server-side session tokens. Guests can play too;
  only signed-in games count toward career stats (played / W / L / T, total
  runs, best score, win-rate bar, streak, last-10 form).
- **Match history** — every finished match for signed-in players is stored and
  browsable on the history page (opponent, mode, score, result, date).
- **AFK auto-pick** — in multiplayer, if a player doesn't lock a number within
  ~6 seconds the server picks a random one for them, so an idle player can
  never stall the match (covers toss numbers, bat/bowl choice, every ball, and
  the innings break).
- **Match UI** — live scoreboard, per-ball timeline, card-flip number reveal
  overlay, wicket/target modals, confetti on wins. Fully responsive.

## Run locally
```bash
npm install
npm run build     # bundles the React client into dist/
npm start         # serves app + API + sockets on http://localhost:3000
```
Open `http://localhost:3000` in two tabs (or two devices on the same Wi-Fi via
your machine's LAN IP) to play multiplayer.

## Develop the client
```bash
npm run dev       # Vite dev server on :5173, proxies /api + sockets to :3000
npm run dev:server
```

## Deploy
Any Node host works — build first, then start:
- **Build command:** `npm install && npm run build`
- **Start command:** `npm start`
- **Health check path:** `/`

### Render (recommended, ~5 minutes)
This repo ships a [Blueprint](https://render.com/docs/blueprint-spec) —
`render.yaml` — so Render can set everything up for you:

1. Push this folder to a GitHub repo, then in Render: **New → Blueprint** and
   pick the repo (or **New → Web Service** and point it at the repo — the
   `render.yaml` settings are picked up automatically).
2. Build & start commands, health check, and the Node version all come from
   the blueprint. Click **Apply** / **Deploy**.
3. You get a public URL like `https://hand-cricket-arena.onrender.com`.
   Create a room and send your friend the **room code** (not the URL).

> `better-sqlite3` compiles a native module — the blueprint pins Node 20 so
> the free-tier build has a toolchain. If you ever see a build error about
> `node-gyp`, make sure `NODE_VERSION` is set to `20.18.1`.

> Voice chat uses WebRTC peer-to-peer with Google/Twilio STUN servers, so
> no TURN setup is needed on Render — audio flows directly between players.

On Render's free tier the service sleeps after inactivity, so the first
request may take ~30s. The free tier has no persistent disk, so accounts and
match history reset on each deploy — upgrade the plan (or add a disk mounted
at `/opt/render/project/src/data`) to keep them.

## Testing
```bash
node smoke-test.js          # needs the server running on :3000
node afk-test.js            # silent player still finishes the match via auto-pick
node rematch-voice-test.js  # rematch consent + mic signaling relay
# any of them can target another port: TEST_PORT=3100 node smoke-test.js
```
smoke-test: signup → full bot match over socket.io → stats assertion.
afk-test: multiplayer match where one player never picks — the AFK watchdog
must carry the game to a result.

## Project structure
```
server.js         Express + Socket.io — rooms, toss, innings, bot hooks, auth API
db.js             SQLite schema + auth (scrypt) + career stats
bot.js            Bot AI: weighted picks, difficulty tiers, pattern reading
client/           React app (Vite root)
  App.jsx         View router + socket state
  styles.css      The whole design system
  components/     AuthPage, HomePage, MenuPage, Lobby, Match, ui primitives
dist/             Production build output (served by the server)
data/arena.db     SQLite database (created on first run)
smoke-test.js     End-to-end test of the full bot-match flow
```

## Game rules (unchanged from the original)
- Toss: caller picks Even/Odd, both secretly pick 1–10; the sum's parity decides.
- Each ball both sides secretly pick 1–6. Same number → **wicket**. Otherwise
  the batter's number is added to the score.
- Innings ends on overs done, all out, or the chase passing the target.
- Higher total wins; equal totals are a tie.
