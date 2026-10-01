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
CREATE TABLE IF NOT EXISTS friendships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_low_id INTEGER NOT NULL REFERENCES users(id),
  user_high_id INTEGER NOT NULL REFERENCES users(id),
  requested_by INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_low_id, user_high_id)
);
CREATE INDEX IF NOT EXISTS idx_friendships_users ON friendships(user_low_id, user_high_id, status);
CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  challenger_id INTEGER NOT NULL REFERENCES users(id),
  challenged_id INTEGER NOT NULL REFERENCES users(id),
  room_code TEXT NOT NULL,
  team_id TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'team',
  settings_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  responded_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_challenges_recipient ON challenges(challenged_id, status, created_at DESC);
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

function pairFor(a, b) {
  const low = Math.min(Number(a), Number(b));
  const high = Math.max(Number(a), Number(b));
  return { low, high };
}

function searchUsers(userId, query) {
  const qText = String(query || "").trim().toLowerCase();
  if (qText.length < 2) return [];
  return db.prepare(`
    SELECT id, username, name FROM users
    WHERE id != ? AND (username LIKE ? OR lower(name) LIKE ?)
    ORDER BY username LIMIT 20
  `).all(userId, `%${qText}%`, `%${qText}%`).map((u) => ({ ...u }));
}

function friendshipStatus(userId, otherId) {
  const { low, high } = pairFor(userId, otherId);
  const row = db.prepare(`SELECT status, requested_by FROM friendships WHERE user_low_id = ? AND user_high_id = ?`).get(low, high);
  if (!row) return null;
  return { status: row.status, requestedBy: row.requested_by };
}

function getFriends(userId) {
  const rows = db.prepare(`
    SELECT u.id, u.username, u.name, f.id AS friendship_id, f.status, f.requested_by
    FROM friendships f
    JOIN users u ON u.id = CASE WHEN f.user_low_id = @user THEN f.user_high_id ELSE f.user_low_id END
    WHERE (f.user_low_id = @user OR f.user_high_id = @user)
    ORDER BY u.name COLLATE NOCASE
  `).all({ user: userId });
  return rows.map((row) => ({ id: row.id, friendshipId: row.friendship_id, username: row.username, name: row.name, status: row.status, requestedBy: row.requested_by }));
}

function sendFriendRequest(userId, otherId) {
  otherId = Number(otherId);
  if (!otherId || otherId === Number(userId) || !q.userById.get(otherId)) return { ok: false, error: "User not found." };
  const { low, high } = pairFor(userId, otherId);
  const existing = db.prepare("SELECT * FROM friendships WHERE user_low_id = ? AND user_high_id = ?").get(low, high);
  if (existing) {
    if (existing.status === "pending" && existing.requested_by !== Number(userId)) {
      db.prepare("UPDATE friendships SET status='accepted', updated_at=datetime('now') WHERE id=?").run(existing.id);
      return { ok: true, status: "accepted" };
    }
    return { ok: false, error: existing.status === "accepted" ? "Already friends." : "Request already sent." };
  }
  db.prepare(`INSERT INTO friendships (user_low_id, user_high_id, requested_by, status) VALUES (?, ?, ?, 'pending')`).run(low, high, userId);
  return { ok: true, status: "pending" };
}

function respondFriendRequest(userId, friendshipId, accept) {
  const row = db.prepare("SELECT * FROM friendships WHERE id = ?").get(Number(friendshipId));
  if (!row || row.status !== "pending" || row.user_low_id !== Number(userId) && row.user_high_id !== Number(userId)) return { ok: false, error: "Request not found." };
  if (accept) db.prepare("UPDATE friendships SET status='accepted', updated_at=datetime('now') WHERE id=?").run(row.id);
  else db.prepare("DELETE FROM friendships WHERE id=?").run(row.id);
  return { ok: true };
}

function removeFriend(userId, otherId) {
  const { low, high } = pairFor(userId, otherId);
  db.prepare("DELETE FROM friendships WHERE user_low_id = ? AND user_high_id = ?").run(low, high);
  return { ok: true };
}

function createChallenge({ id, challengerId, challengedId, roomCode, teamId = "B", settings = {} }) {
  const status = friendshipStatus(challengerId, challengedId);
  if (!status || status.status !== "accepted") return { ok: false, error: "You can only challenge accepted friends." };
  const challengeId = String(id || newToken());
  db.prepare(`INSERT INTO challenges (id, challenger_id, challenged_id, room_code, team_id, settings_json, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+30 minutes'))`).run(
    challengeId, challengerId, challengedId, String(roomCode), teamId, JSON.stringify(settings || {})
  );
  return { ok: true, id: challengeId };
}

function getChallenges(userId) {
  const rows = db.prepare(`
    SELECT c.*, cu.username AS challenger_username, cu.name AS challenger_name,
           tu.username AS challenged_username, tu.name AS challenged_name
    FROM challenges c
    JOIN users cu ON cu.id = c.challenger_id
    JOIN users tu ON tu.id = c.challenged_id
    WHERE (c.challenger_id = ? OR c.challenged_id = ?)
      AND c.status = 'pending' AND c.expires_at > datetime('now')
    ORDER BY c.created_at DESC
  `).all(userId, userId);
  return rows.map((r) => ({
    id: r.id, roomCode: r.room_code, teamId: r.team_id, mode: r.mode,
    status: r.status, settings: JSON.parse(r.settings_json || "{}"), expiresAt: r.expires_at,
    challenger: { id: r.challenger_id, username: r.challenger_username, name: r.challenger_name },
    challenged: { id: r.challenged_id, username: r.challenged_username, name: r.challenged_name },
    incoming: Number(r.challenged_id) === Number(userId),
  }));
}

function respondChallenge(userId, challengeId, accept) {
  const row = db.prepare("SELECT * FROM challenges WHERE id = ? AND challenged_id = ? AND status = 'pending'").get(String(challengeId), userId);
  if (!row) return { ok: false, error: "Challenge not found or expired." };
  db.prepare("UPDATE challenges SET status = ?, responded_at = datetime('now') WHERE id = ?").run(accept ? "accepted" : "declined", row.id);
  return { ok: true, accepted: !!accept, roomCode: row.room_code, teamId: row.team_id };
}

function cancelChallenge(userId, challengeId) {
  db.prepare("UPDATE challenges SET status='cancelled', responded_at=datetime('now') WHERE id=? AND challenger_id=? AND status='pending'").run(String(challengeId), userId);
  return { ok: true };
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

module.exports = {
  signup, login, userForToken, logout, getStats, getMatches, recordResult,
  searchUsers, getFriends, sendFriendRequest, respondFriendRequest, removeFriend,
  createChallenge, getChallenges, respondChallenge, cancelChallenge,
};
