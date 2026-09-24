// SQLite persistence: users, sessions, career stats.
// Uses better-sqlite3 (sync, fast, zero-config) — database lives in data/arena.db

const Database = require("better-sqlite3");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "arena.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS stats (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  ties INTEGER NOT NULL DEFAULT 0,
  runs INTEGER NOT NULL DEFAULT 0,
  best INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  opponent TEXT NOT NULL,
  vs_bot INTEGER NOT NULL DEFAULT 0,
  difficulty TEXT,
  you_runs INTEGER NOT NULL,
  opp_runs INTEGER NOT NULL,
  outcome TEXT NOT NULL, -- 'win' | 'loss' | 'tie'
  margin INTEGER,        -- runs / wickets the result was decided by (NULL on a tie)
  margin_type TEXT,      -- 'runs' | 'wickets'
  played_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_matches_user ON matches(user_id, id DESC);
`);

// lightweight migration: margin columns for DBs created before they existed
const matchCols = new Set(db.prepare("PRAGMA table_info(matches)").all().map((c) => c.name));
if (!matchCols.has("margin")) db.exec("ALTER TABLE matches ADD COLUMN margin INTEGER");
if (!matchCols.has("margin_type")) db.exec("ALTER TABLE matches ADD COLUMN margin_type TEXT");

const q = {
  userByName: db.prepare("SELECT * FROM users WHERE username = ?"),
  userById: db.prepare("SELECT id, username, name FROM users WHERE id = ?"),
  insertUser: db.prepare("INSERT INTO users (username, name, pass_hash) VALUES (?, ?, ?)"),
  insertSession: db.prepare("INSERT INTO sessions (token, user_id) VALUES (?, ?)"),
  session: db.prepare("SELECT s.token, u.id, u.username, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?"),
  deleteSession: db.prepare("DELETE FROM sessions WHERE token = ?"),
  stats: db.prepare("SELECT * FROM stats WHERE user_id = ?"),
  insertStats: db.prepare("INSERT INTO stats (user_id) VALUES (?)"),
  applyResult: db.prepare(`
    UPDATE stats SET
      played = played + @played,
      wins = wins + @wins,
      losses = losses + @losses,
      ties = ties + @ties,
      runs = runs + @runs,
      best = MAX(best, @best)
    WHERE user_id = @user_id
  `),
  insertMatch: db.prepare(`
    INSERT INTO matches (user_id, opponent, vs_bot, difficulty, you_runs, opp_runs, outcome, margin, margin_type)
    VALUES (@user_id, @opponent, @vs_bot, @difficulty, @you_runs, @opp_runs, @outcome, @margin, @margin_type)
  `),
  recentMatches: db.prepare("SELECT id, opponent, vs_bot, difficulty, you_runs, opp_runs, outcome, margin, margin_type, played_at FROM matches WHERE user_id = ? ORDER BY id DESC LIMIT ?"),
  recentOutcomes: db.prepare("SELECT outcome FROM matches WHERE user_id = ? ORDER BY id DESC LIMIT 10"),
};

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [salt, hash] = String(stored).split(":");
    const check = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), check);
  } catch {
    return false;
  }
}

function newToken() {
  return crypto.randomBytes(32).toString("hex");
}

function normalizeUsername(raw) {
  return String(raw || "").trim().toLowerCase();
}

function signup({ username, name, password }) {
  username = normalizeUsername(username);
  name = String(name || "").trim().slice(0, 20) || username;
  if (!/^[a-z0-9_]{3,16}$/.test(username)) {
    return { ok: false, error: "Username must be 3–16 chars: letters, numbers, underscore." };
  }
  if (String(password || "").length < 4) {
    return { ok: false, error: "Password must be at least 4 characters." };
  }
  if (q.userByName.get(username)) {
    return { ok: false, error: "That username is taken." };
  }
  const info = q.insertUser.run(username, name, hashPassword(password));
  const userId = info.lastInsertRowid;
  q.insertStats.run(userId);
  const token = newToken();
  q.insertSession.run(token, userId);
  return { ok: true, token, user: { id: userId, username, name } };
}

function login({ username, password }) {
  username = normalizeUsername(username);
  const user = q.userByName.get(username);
  if (!user || !verifyPassword(password, user.pass_hash)) {
    return { ok: false, error: "Wrong username or password." };
  }
  const token = newToken();
  q.insertSession.run(token, user.id);
  return { ok: true, token, user: { id: user.id, username: user.username, name: user.name } };
}

function userForToken(token) {
  if (!token) return null;
  const row = q.session.get(String(token));
  return row ? { id: row.id, username: row.username, name: row.name } : null;
}

function logout(token) {
  if (token) q.deleteSession.run(String(token));
}

function getStats(userId) {
  let s = q.stats.get(userId);
  if (!s) {
    q.insertStats.run(userId);
    s = q.stats.get(userId);
  }
  const recent = q.recentOutcomes.all(userId);
  let streakType = null;
  let streakCount = 0;
  for (const m of recent) {
    if (streakType === null) {
      streakType = m.outcome;
      streakCount = 1;
    } else if (m.outcome === streakType) {
      streakCount += 1;
    } else break;
  }
  return {
    played: s.played,
    wins: s.wins,
    losses: s.losses,
    ties: s.ties,
    runs: s.runs,
    best: s.best,
    winRate: s.played ? Math.round((s.wins / s.played) * 100) : 0,
    streak: streakType ? `${streakType[0].toUpperCase()}${streakCount}` : "—",
    last10Wins: recent.filter((m) => m.outcome === "win").length,
  };
}

function getMatches(userId, limit = 25) {
  return q.recentMatches.all(userId, Math.max(1, Math.min(100, limit))).map((m) => ({
    id: m.id,
    opponent: m.opponent,
    vsBot: !!m.vs_bot,
    difficulty: m.difficulty,
    youRuns: m.you_runs,
    oppRuns: m.opp_runs,
    outcome: m.outcome,
    margin: m.margin,
    marginType: m.margin_type,
    playedAt: m.played_at,
  }));
}

// result: { winner, youAreP1, youRuns, oppRuns, vsBot, opponent, difficulty,
//            margin, marginType } — margin/marginType computed by the server
function recordResult(userId, { winner, youAreP1, youRuns, oppRuns, vsBot, opponent, difficulty, margin = null, marginType = null }) {
  const outcome = winner === null ? "ties" : (winner === (youAreP1 ? "p1" : "p2") ? "wins" : "losses");
  q.applyResult.run({
    user_id: userId,
    played: 1,
    wins: outcome === "wins" ? 1 : 0,
    losses: outcome === "losses" ? 1 : 0,
    ties: outcome === "ties" ? 1 : 0,
    runs: Math.max(0, youRuns | 0),
    best: Math.max(0, youRuns | 0),
  });
  q.insertMatch.run({
    user_id: userId,
    opponent: String(opponent || "Unknown").slice(0, 40),
    vs_bot: vsBot ? 1 : 0,
    difficulty: difficulty || null,
    you_runs: Math.max(0, youRuns | 0),
    opp_runs: Math.max(0, oppRuns | 0),
    outcome: outcome === "ties" ? "tie" : outcome === "wins" ? "win" : "loss",
    margin: margin === null ? null : Math.max(0, margin | 0),
    margin_type: marginType || null,
  });
  return { outcome, vsBot };
}

module.exports = { signup, login, userForToken, logout, getStats, getMatches, recordResult };
