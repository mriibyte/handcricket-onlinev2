// Hand Cricket Arena — server
// Express + Socket.io + SQLite (accounts, sessions, career stats) + bot AI.
// Also serves the built React client from /dist.

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const db = require("./db");
const bot = require("./bot");
const teamGame = require("./teamGame");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, methods: ["GET", "POST"], credentials: true },
});

// The Android build runs the client from capacitor://localhost while the
// game/API remain on Render. Keep the API usable from that packaged origin.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "dist")));

// ------------------------------------------------------------------ auth API
app.post("/api/signup", (req, res) => {
  const r = db.signup(req.body || {});
  if (r.ok) res.json(r);
  else res.status(400).json(r);
});

app.post("/api/login", (req, res) => {
  const r = db.login(req.body || {});
  if (r.ok) res.json(r);
  else res.status(400).json(r);
});

app.post("/api/logout", (req, res) => {
  db.logout((req.body || {}).token);
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  const user = db.userForToken(req.headers.authorization?.replace(/^Bearer\s+/i, ""));
  if (!user) return res.status(401).json({ ok: false, error: "Not signed in." });
  res.json({ ok: true, user, stats: db.getStats(user.id) });
});

// tiny health endpoint for keep-alive pings and uptime monitors
app.get("/api/health", (req, res) => res.json({ ok: true, uptime: process.uptime() }));

// Voice config is intentionally public and contains no secrets by default.
// A TURN provider can be supplied later through environment variables without
// baking credentials into the web or Android client.
app.get("/api/voice-config", (req, res) => {
  const iceServers = [
    { urls: ["stun:stun.l.google.com:19302", "stun:global.stun.twilio.com:3478"] },
  ];
  if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }
  res.json({ iceServers });
});

app.get("/api/matches", (req, res) => {
  const user = db.userForToken(req.headers.authorization?.replace(/^Bearer\s+/i, ""));
  if (!user) return res.status(401).json({ ok: false, error: "Not signed in." });
  res.json({ ok: true, matches: db.getMatches(user.id, parseInt(req.query.limit) || 25) });
});

function authUser(req, res) {
  const user = db.userForToken(req.headers.authorization?.replace(/^Bearer\s+/i, ""));
  if (!user) {
    res.status(401).json({ ok: false, error: "Not signed in." });
    return null;
  }
  return user;
}

app.get("/api/users/search", (req, res) => {
  const user = authUser(req, res);
  if (!user) return;
  res.json({ ok: true, users: db.searchUsers(user.id, req.query.q) });
});

app.get("/api/friends", (req, res) => {
  const user = authUser(req, res);
  if (!user) return;
  res.json({ ok: true, friends: db.getFriends(user.id) });
});

app.post("/api/friends/requests", (req, res) => {
  const user = authUser(req, res);
  if (!user) return;
  const targetId = req.body?.userId || (req.body?.username ? db.searchUsers(user.id, req.body.username).find((x) => x.username === String(req.body.username).toLowerCase())?.id : null);
  const result = db.sendFriendRequest(user.id, targetId);
  if (!result.ok) return res.status(400).json(result);
  io.to(`user:${targetId}`).emit("friend_request_received", { from: user });
  res.json(result);
});

app.post("/api/friends/requests/:id/accept", (req, res) => {
  const user = authUser(req, res);
  if (!user) return;
  const result = db.respondFriendRequest(user.id, req.params.id, true);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

app.post("/api/friends/requests/:id/decline", (req, res) => {
  const user = authUser(req, res);
  if (!user) return;
  const result = db.respondFriendRequest(user.id, req.params.id, false);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

app.delete("/api/friends/:userId", (req, res) => {
  const user = authUser(req, res);
  if (!user) return;
  res.json(db.removeFriend(user.id, req.params.userId));
});

app.get("/api/challenges", (req, res) => {
  const user = authUser(req, res);
  if (!user) return;
  res.json({ ok: true, challenges: db.getChallenges(user.id) });
});

app.post("/api/challenges", (req, res) => {
  const user = authUser(req, res);
  if (!user) return;
  const result = db.createChallenge({
    challengerId: user.id,
    challengedId: req.body?.friendId,
    roomCode: req.body?.roomCode,
    teamId: req.body?.teamId || "B",
    settings: req.body?.settings || {},
  });
  if (!result.ok) return res.status(400).json(result);
  io.to(`user:${req.body.friendId}`).emit("challenge_received", { id: result.id, roomCode: req.body.roomCode, teamId: req.body.teamId || "B", from: user });
  res.json(result);
});

app.post("/api/challenges/:id/accept", (req, res) => {
  const user = authUser(req, res);
  if (!user) return;
  const result = db.respondChallenge(user.id, req.params.id, true);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

app.post("/api/challenges/:id/decline", (req, res) => {
  const user = authUser(req, res);
  if (!user) return;
  const result = db.respondChallenge(user.id, req.params.id, false);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

app.delete("/api/challenges/:id", (req, res) => {
  const user = authUser(req, res);
  if (!user) return;
  res.json(db.cancelChallenge(user.id, req.params.id));
});

// ---------------------------------------------------------------- game rooms
/** rooms keyed by room code */
const rooms = new Map();

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let code;
  do {
    code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function newRoom(code, hostSocketId, hostName, overs, wickets, botDifficulty = null) {
  return {
    code,
    overs,
    wickets,
    balls: overs * 6,
    vsBot: !!botDifficulty,
    botDifficulty,
    players: {
      p1: { id: hostSocketId, name: hostName, connected: true },
      p2: botDifficulty
        ? { id: "BOT", name: `BOT · ${botDifficulty}`, connected: true }
        : null,
    },
    phase: "lobby", // lobby -> toss_call -> toss_number -> bat_bowl_choice -> innings -> innings_break -> result
    toss: { call: null, num: { p1: null, p2: null }, autoPick: { p1: false, p2: false } },
    battingFirst: null, // 'p1' | 'p2'
    inningsNo: 1,
    target: null,
    current: null, // { battingSide, runs, wicketsLeft, ballsPlayed, pick:{p1,p2} }
    firstInningsSummary: null, // { side, runs }
    lastEvent: null,
    lastEventSeq: 0, // monotonically increasing so clients can dedupe popups
    rematch: null, // { by } while a rematch is proposed, { declinedBy } after a no
  };
}

/** wipe per-match state so the same room can play again (rematch / rejoin) */
function resetMatchState(room) {
  clearAfk(room);
  room.toss = { call: null, num: { p1: null, p2: null }, autoPick: { p1: false, p2: false } };
  room.battingFirst = null;
  room.inningsNo = 1;
  room.target = null;
  room.current = null;
  room.firstInningsSummary = null;
  room.lastEvent = null;
  room.resultWinner = null;
  room.botHistory = [];
  room.rematch = null;
  room.phase = "toss_call";
}

function otherRole(role) {
  return role === "p1" ? "p2" : "p1";
}

function roleOfSocket(room, socketId) {
  if (room.players.p1 && room.players.p1.id === socketId) return "p1";
  if (room.players.p2 && room.players.p2.id === socketId) return "p2";
  return null;
}

function startInnings(room, battingSide, target) {
  room.current = {
    battingSide,
    runs: 0,
    wicketsLeft: room.wickets,
    ballsPlayed: 0,
    pick: { p1: null, p2: null },
    autoPick: { p1: false, p2: false },
  };
  room.target = target;
  room.phase = "innings";
  room.lastEvent = null;
  clearAfk(room);
}

function resolveBall(room) {
  clearAfk(room);
  const { battingSide } = room.current;
  const bowlingSide = otherRole(battingSide);
  const batterNum = room.current.pick[battingSide];
  const bowlerNum = room.current.pick[bowlingSide];

  let event = null;

  if (batterNum === bowlerNum) {
    room.current.wicketsLeft -= 1;
    event = { type: "wicket", batterNum, bowlerNum, side: battingSide };
  } else {
    room.current.runs += batterNum;
    event = { type: "runs", batterNum, bowlerNum, runsAdded: batterNum, side: battingSide };
  }

  room.current.ballsPlayed += 1;
  room.current.pick = { p1: null, p2: null };
  room.current.autoPick = { p1: false, p2: false };

  const targetReached = room.target !== null && room.current.runs > room.target;
  const allOut = room.current.wicketsLeft <= 0;
  const oversDone = room.current.ballsPlayed >= room.balls;

  let inningsOver = targetReached || allOut || oversDone;

  if (targetReached) event.reachedTarget = true;
  if (allOut) event.allOut = true;

  room.lastEvent = event;
  room.lastEventSeq += 1;
  event.seq = room.lastEventSeq;

  if (inningsOver) {
    if (room.inningsNo === 1) {
      room.firstInningsSummary = { side: battingSide, runs: room.current.runs };
      room.phase = "innings_break";
      if (!room.vsBot) scheduleAfk(room, "innings2"); // both idle at the break → roll on
    } else {
      room.phase = "result";
      room.resultWinner = computeResult(room).winner;
      recordStatsIfTracked(room);
    }
  } else if (!room.vsBot) {
    scheduleAfk(room, "ball"); // new ball, both human: arm the idle timer again
  }
}

// ------------------------------------------------------------------ bot brain
function botRole(room) {
  return room.vsBot ? "p2" : null;
}

function botHistory(room) {
  room.botHistory = room.botHistory || [];
  return room.botHistory;
}

function botAct(room) {
  if (!room.vsBot || room.phase === "lobby" || room.phase === "result") return;
  const role = botRole(room);

  // toss_call: the human always calls even/odd — nothing for the bot to do here.
  if (room.phase === "toss_number") {
    if (room.toss.num[role] === null) {
      room.toss.num[role] = bot.botTossNumber();
      if (room.toss.num.p1 !== null && room.toss.num.p2 !== null) {
        const total = room.toss.num.p1 + room.toss.num.p2;
        const result = total % 2 === 0 ? "e" : "o";
        room.toss.result = result;
        room.toss.winner = result === room.toss.call ? "p1" : "p2";
        room.phase = "bat_bowl_choice";
      }
    }
  } else if (room.phase === "bat_bowl_choice") {
    if (room.toss.winner === role) {
      const choice = bot.botBatBowlChoice(room.botDifficulty);
      room.battingFirst = choice === "bat" ? role : otherRole(role);
      room.inningsNo = 1;
      startInnings(room, room.battingFirst, null);
    }
  } else if (room.phase === "innings" && room.current) {
    const c = room.current;
    if (c.pick[role] === null) {
      const batting = c.battingSide === role;
      c.pick[role] = bot.botBallPick(room.botDifficulty, batting, botHistory(room));
    }
    if (c.pick.p1 !== null && c.pick.p2 !== null) resolveBall(room);
  }

  broadcast(room);
}

// Track the human's numbers so the bot can "read" them over time.
function recordHumanPick(room, num) {
  if (!room.vsBot) return;
  botHistory(room).push(num);
}

// ------------------------------------------------------- AFK auto-pick
// If a human doesn't move within AFK_MS, the server locks a random number for
// them so an idle player can never stall the match.
const AFK_MS = 6000;

function clearAfk(room) {
  if (room.afkTimer) {
    clearTimeout(room.afkTimer);
    room.afkTimer = null;
  }
}

function isHuman(room, role) {
  const p = room.players[role];
  return p && p.id !== "BOT";
}

function scheduleAfk(room, kind) {
  if (!kind || room.afkTimer) return; // nothing to guard, or already armed
  room.afkTimer = setTimeout(() => {
    room.afkTimer = null;
    if (kind === "toss") {
      if (room.phase !== "toss_number") return;
      ["p1", "p2"].forEach((r) => {
        if (room.toss.num[r] === null && isHuman(room, r)) {
          room.toss.num[r] = 1 + Math.floor(Math.random() * 10);
          room.toss.autoPick[r] = true;
        }
      });
      if (room.toss.num.p1 !== null && room.toss.num.p2 !== null && !room.toss.result) {
        const total = room.toss.num.p1 + room.toss.num.p2;
        const result = total % 2 === 0 ? "e" : "o";
        room.toss.result = result;
        room.toss.winner = result === room.toss.call ? "p1" : "p2";
        room.phase = "bat_bowl_choice";
        scheduleAfk(room, "batbowl"); // idle toss winner shouldn't stall either
      }
    } else if (kind === "batbowl") {
      if (room.phase !== "bat_bowl_choice") return;
      const winner = room.toss.winner;
      if (winner && isHuman(room, winner)) {
        const choice = Math.random() < 0.6 ? "bat" : "bowl";
        room.battingFirst = choice === "bat" ? winner : otherRole(winner);
        room.inningsNo = 1;
        startInnings(room, room.battingFirst, null);
      }
    } else if (kind === "innings2") {
      if (room.phase !== "innings_break") return;
      room.inningsNo = 2;
      const battingSide = otherRole(room.firstInningsSummary.side);
      startInnings(room, battingSide, room.firstInningsSummary.runs);
    } else if (kind === "ball") {
      if (room.phase !== "innings" || !room.current) return;
      ["p1", "p2"].forEach((r) => {
        if (room.current.pick[r] === null && isHuman(room, r)) {
          room.current.pick[r] = 1 + Math.floor(Math.random() * 6);
          room.current.autoPick[r] = true;
        }
      });
      if (room.current.pick.p1 !== null && room.current.pick.p2 !== null) resolveBall(room);
    }
    broadcast(room);
  }, AFK_MS);
}

function recordStatsIfTracked(room) {
  const result = computeResult(room);
  ["p1", "p2"].forEach((role) => {
    const p = room.players[role];
    if (!p || !p.userId || p.id === "BOT") return;
    const opp = room.players[otherRole(role)];
    const battedFirst = room.firstInningsSummary.side === role;
    const r = db.recordResult(p.userId, {
      winner: result.winner,
      youAreP1: role === "p1",
      youRuns: battedFirst ? room.firstInningsSummary.runs : room.current.runs,
      oppRuns: battedFirst ? room.current.runs : room.firstInningsSummary.runs,
      vsBot: room.vsBot,
      opponent: opp ? opp.name : "Unknown",
      difficulty: room.vsBot ? room.botDifficulty : null,
      margin: result.margin,
      marginType: result.marginType,
    });
    console.log(`[stats] ${p.name}: ${r.outcome} (${room.vsBot ? "vs bot" : "multiplayer"})`);
  });
}

// ---------------------------------------------------------------- broadcasting
function publicState(room, forRole) {
  const oppRole = otherRole(forRole);
  const you = room.players[forRole];
  const opp = room.players[oppRole];

  let current = null;
  if (room.current) {
    current = {
      battingSide: room.current.battingSide === forRole ? "you" : "opponent",
      runs: room.current.runs,
      wicketsLeft: room.current.wicketsLeft,
      ballsPlayed: room.current.ballsPlayed,
      youPicked: room.current.pick[forRole] !== null,
      oppPicked: room.current.pick[oppRole] !== null,
      youAutoPicked: !!(room.current.autoPick && room.current.autoPick[forRole]),
      oppAutoPicked: !!(room.current.autoPick && room.current.autoPick[oppRole]),
    };
  }

  return {
    code: room.code,
    vsBot: room.vsBot,
    botDifficulty: room.botDifficulty,
    overs: room.overs,
    wickets: room.wickets,
    balls: room.balls,
    phase: room.phase,
    you: { name: you ? you.name : null, role: forRole },
    opponent: opp ? { name: opp.name, connected: opp.connected } : null,
    tossCallerIsYou: room.phase.startsWith("toss") ? forRole === "p1" : undefined,
    toss: {
      call: room.toss.call,
      youSubmitted: room.toss.num[forRole] !== null,
      oppSubmitted: room.toss.num[oppRole] !== null,
      youAutoPicked: !!(room.toss.autoPick && room.toss.autoPick[forRole]),
      oppAutoPicked: !!(room.toss.autoPick && room.toss.autoPick[oppRole]),
    },
    battingFirstIsYou: room.battingFirst ? room.battingFirst === forRole : null,
    canChooseBatBowl: room.phase === "bat_bowl_choice" && room.toss.winner === forRole,
    inningsNo: room.inningsNo,
    target: room.target,
    current,
    firstInningsSummary: room.firstInningsSummary
      ? {
          isYou: room.firstInningsSummary.side === forRole,
          runs: room.firstInningsSummary.runs,
        }
      : null,
    lastEvent: room.lastEvent ? { ...room.lastEvent, isYou: room.lastEvent.side === forRole } : null,
    lastEventSeq: room.lastEventSeq,
    result: room.phase === "result" ? computeResult(room) : null,
    rematch: room.rematch
      ? {
          pending: !room.rematch.declinedBy,
          requestIsMine: room.rematch.by === forRole,
          declinedByMe: room.rematch.declinedBy === forRole,
          declinedByOpponent: !!room.rematch.declinedBy && room.rematch.declinedBy !== forRole,
        }
      : null,
  };
}

function computeResult(room) {
  const firstSide = room.firstInningsSummary.side;
  const firstRuns = room.firstInningsSummary.runs;
  const secondSide = room.current.battingSide;
  const secondRuns = room.current.runs;

  const p1Runs = firstSide === "p1" ? firstRuns : secondRuns;
  const p2Runs = firstSide === "p2" ? firstRuns : secondRuns;

  let winner = null;
  if (p1Runs > p2Runs) winner = "p1";
  else if (p2Runs > p1Runs) winner = "p2";

  // margin: chasing side won with wickets in hand, defending side won by
  // the run gap (or the first-innings side won because the chase fell short)
  let margin = null;
  let marginType = null;
  if (winner) {
    if (secondRuns > firstRuns) {
      margin = room.current.wicketsLeft;
      marginType = "wickets";
    } else {
      margin = Math.abs(firstRuns - secondRuns);
      marginType = "runs";
    }
  }

  return { p1Runs, p2Runs, winner, margin, marginType };
}

function broadcast(room) {
  if (teamGame.isTeamRoom(room)) {
    teamGame.sendState(room, io);
    return;
  }
  ["p1", "p2"].forEach((role) => {
    const player = room.players[role];
    if (player && player.connected && player.id !== "BOT") {
      io.to(player.id).emit("state", publicState(room, role));
    }
  });
}

// ------------------------------------------------------------------- sockets
io.on("connection", (socket) => {
  socket.data.user = null; // { id, name } when logged in

  socket.on("hello", ({ token } = {}) => {
    const user = db.userForToken(token);
    if (socket.data.user?.id) socket.leave(`user:${socket.data.user.id}`);
    if (user) {
      socket.data.user = user;
      socket.join(`user:${user.id}`);
      socket.emit("session", { ok: true, user, stats: db.getStats(user.id) });
    } else {
      socket.emit("session", { ok: false });
    }
  });

  socket.on("create_room", ({ name, overs, wickets, token, difficulty, mode, maxTeamSize, invitedUserIds } = {}, cb) => {
    const user = token ? db.userForToken(token) : null;
    overs = Math.max(1, Math.min(20, parseInt(overs) || 2));
    wickets = Math.max(1, Math.min(10, parseInt(wickets) || 2));
    const botDiff = ["easy", "medium", "hard"].includes(difficulty) ? difficulty : null;
    const displayName = user ? user.name : String(name || "Player 1").slice(0, 20);
    const code = makeCode();
    if (mode === "team") {
      if (!user) return cb && cb({ ok: false, error: "Sign in to create a team room." });
      const room = teamGame.createRoom({ code, socketId: socket.id, user, name: displayName, overs, wickets, maxTeamSize });
      room.onChange = () => teamGame.sendState(room, io);
      rooms.set(code, room);
      socket.join(code);
      socket.data.room = code;
      socket.data.teamPlayerId = room.hostPlayerId;
      cb && cb({ ok: true, code, mode: "team" });
      teamGame.sendState(room, io);
      for (const invitedUserId of Array.isArray(invitedUserIds) ? invitedUserIds : []) {
        const challenge = db.createChallenge({ challengerId: user.id, challengedId: invitedUserId, roomCode: code, teamId: "B", settings: { overs, wickets, maxTeamSize } });
        if (challenge.ok) io.to(`user:${invitedUserId}`).emit("challenge_received", { id: challenge.id, roomCode: code, teamId: "B", from: user });
      }
      return;
    }
    const room = newRoom(code, socket.id, displayName, overs, wickets, botDiff);
    if (user) room.players.p1.userId = user.id;
    rooms.set(code, room);
    if (botDiff) room.phase = "toss_call"; // solo: skip the lobby, straight to the toss
    socket.join(code);
    socket.data.room = code;
    cb && cb({ ok: true, code });
    broadcast(room);
  });

  socket.on("join_room", ({ name, code, teamId } = {}, cb) => {
    code = String(code || "").toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return cb && cb({ ok: false, error: "Room not found." });
    if (teamGame.isTeamRoom(room)) {
      const user = socket.data.user;
      if (!user) return cb && cb({ ok: false, error: "Sign in to join a team room." });
      const result = teamGame.addPlayer(room, { socketId: socket.id, user, name: user.name || name, teamId });
      if (!result.ok) return cb && cb(result);
      socket.join(code);
      socket.data.room = code;
      socket.data.teamPlayerId = result.player.playerId;
      cb && cb({ ok: true, code, mode: "team", playerId: result.player.playerId });
      teamGame.sendState(room, io);
      return;
    }
    if (room.vsBot) return cb && cb({ ok: false, error: "That room is singleplayer." });
    if (room.players.p2 && room.players.p2.connected) {
      return cb && cb({ ok: false, error: "Room is full." });
    }
    const user = socket.data.user;
    const displayName = user ? user.name : String(name || "Player 2").slice(0, 20);
    room.players.p2 = { id: socket.id, name: displayName, connected: true };
    if (user) room.players.p2.userId = user.id;
    socket.join(code);
    socket.data.room = code;
    resetMatchState(room); // fresh toss even if the host idled on an old screen
    cb && cb({ ok: true, code });
    broadcast(room);
  });

  socket.on("leave_room", () => {
    const code = socket.data.room;
    const room = rooms.get(code);
    if (room) {
      if (teamGame.isTeamRoom(room)) {
        const player = teamGame.playerForSocket(room, socket.id);
        if (player) player.connected = false;
        socket.leave(code || "");
        socket.data.room = null;
        socket.data.teamPlayerId = null;
        teamGame.sendState(room, io);
        return;
      }
      clearAfk(room);
      const role = roleOfSocket(room, socket.id);
      if (role) {
        room.players[role].connected = false;
        broadcast(room);
      }
      if (room.vsBot) rooms.delete(code);
    }
    socket.leave(code || "");
    socket.data.room = null;
  });

  socket.on("toss_call", ({ call } = {}) => {
    const room = rooms.get(socket.data.room);
    if (!room || room.phase !== "toss_call") return;
    const role = roleOfSocket(room, socket.id);
    if (role !== "p1" || (call !== "e" && call !== "o")) return;
    room.toss.call = call;
    room.phase = "toss_number";
    broadcast(room);
    if (room.vsBot) setTimeout(() => botAct(room), 900);
    else scheduleAfk(room, "toss"); // caller sitting on this screen forever shouldn't stall the room
  });

  socket.on("toss_number", ({ num } = {}) => {
    const room = rooms.get(socket.data.room);
    if (!room || room.phase !== "toss_number") return;
    const role = roleOfSocket(room, socket.id);
    num = parseInt(num);
    if (!role || num < 1 || num > 10) return;
    if (room.toss.num[role] !== null) return;
    clearAfk(room);
    room.toss.num[role] = num;

    if (room.toss.num.p1 !== null && room.toss.num.p2 !== null) {
      const total = room.toss.num.p1 + room.toss.num.p2;
      const result = total % 2 === 0 ? "e" : "o";
      room.toss.result = result;
      room.toss.winner = result === room.toss.call ? "p1" : "p2";
      room.phase = "bat_bowl_choice";
    }
    broadcast(room);
    if (room.vsBot) setTimeout(() => botAct(room), 900);
    else scheduleAfk(room, room.phase === "toss_number" ? "toss" : "batbowl");
  });

  socket.on("bat_bowl_choice", ({ choice } = {}) => {
    const room = rooms.get(socket.data.room);
    if (!room || room.phase !== "bat_bowl_choice") return;
    const role = roleOfSocket(room, socket.id);
    if (role !== room.toss.winner) return;
    if (choice !== "bat" && choice !== "bowl") return;
    room.battingFirst = choice === "bat" ? role : otherRole(role);
    room.inningsNo = 1;
    startInnings(room, room.battingFirst, null);
    broadcast(room);
    if (room.vsBot) setTimeout(() => botAct(room), 700);
  });

  socket.on("ball_pick", ({ num } = {}) => {
    const room = rooms.get(socket.data.room);
    if (!room || room.phase !== "innings" || !room.current) return;
    const role = roleOfSocket(room, socket.id);
    num = parseInt(num);
    if (!role || num < 1 || num > 6) return;
    if (room.current.pick[role] !== null) return;
    clearAfk(room);

    room.current.pick[role] = num;
    recordHumanPick(room, num);
    broadcast(room); // opponent sees "picked" indicator

    if (room.current.pick.p1 !== null && room.current.pick.p2 !== null) {
      resolveBall(room);
      broadcast(room);
    } else if (room.vsBot) {
      setTimeout(() => botAct(room), 550 + Math.random() * 650);
    } else {
      scheduleAfk(room, "ball"); // opponent is human and hasn't picked — start the countdown
    }
  });

  socket.on("start_second_innings", () => {
    const room = rooms.get(socket.data.room);
    if (!room || room.phase !== "innings_break") return;
    room.inningsNo = 2;
    const battingSide = otherRole(room.firstInningsSummary.side);
    startInnings(room, battingSide, room.firstInningsSummary.runs);
    broadcast(room);
    if (room.vsBot) setTimeout(() => botAct(room), 700);
  });

  // Rematch: instant vs the bot; in multiplayer the other player must agree.
  socket.on("rematch", () => {
    const room = rooms.get(socket.data.room);
    if (!room || room.phase !== "result") return;
    const role = roleOfSocket(room, socket.id);
    if (!role) return;

    if (room.vsBot) {
      const { overs, wickets, botDifficulty } = room;
      const host = room.players.p1;
      const fresh = newRoom(room.code, host.id, host.name, overs, wickets, botDifficulty);
      fresh.players.p1.userId = host.userId;
      fresh.phase = "toss_call";
      rooms.set(room.code, fresh);
      socket.data.room = room.code;
      broadcast(fresh);
      return;
    }

    if (room.rematch && !room.rematch.declinedBy) {
      if (room.rematch.by === role) return; // already waiting on the opponent
      resetMatchState(room); // they asked first — pressing counts as accepting
    } else {
      room.rematch = { by: role }; // propose / re-propose
    }
    broadcast(room);
  });

  socket.on("rematch_response", ({ accept } = {}) => {
    const room = rooms.get(socket.data.room);
    if (!room || room.phase !== "result" || room.vsBot) return;
    if (!room.rematch || room.rematch.declinedBy) return;
    const role = roleOfSocket(room, socket.id);
    if (!role || role === room.rematch.by) return; // only the asked player responds
    if (accept) resetMatchState(room);
    else room.rematch = { declinedBy: role };
    broadcast(room);
  });

  // ------------------------------------------------------- team rooms
  socket.on("team_action", ({ event, data } = {}, cb) => {
    const room = rooms.get(socket.data.room);
    if (!teamGame.isTeamRoom(room)) return cb && cb({ ok: false, error: "Not a team room." });
    const playerId = socket.data.teamPlayerId || teamGame.roleOfSocket(room, socket.id);
    const result = teamGame.handle(room, playerId, event, data);
    cb && cb(result);
    if (result.ok && room.phase === "result" && room.result && !room.resultRecorded) {
      room.resultRecorded = true;
      for (const player of Object.values(room.players)) {
        if (!player.userId) continue;
        const youRuns = room.result.scores[player.teamId];
        const opponentTeamId = player.teamId === "A" ? "B" : "A";
        db.recordResult(player.userId, {
          winner: room.result.winnerTeamId ? (room.result.winnerTeamId === "A" ? "p1" : "p2") : null,
          youAreP1: player.teamId === "A",
          youRuns,
          oppRuns: room.result.scores[opponentTeamId],
          vsBot: false,
          opponent: `Team ${opponentTeamId}`,
          difficulty: null,
          margin: room.result.margin,
          marginType: room.result.marginType,
        });
      }
    }
    if (result.ok) teamGame.sendState(room, io);
  });

  socket.on("team_invite", ({ userId, teamId = "B" } = {}, cb) => {
    const room = rooms.get(socket.data.room);
    const player = room && teamGame.playerForSocket(room, socket.id);
    if (!teamGame.isTeamRoom(room) || !player || player.playerId !== room.hostPlayerId && player.playerId !== room.teams[player.teamId].captainPlayerId) {
      return cb && cb({ ok: false, error: "Only a team captain can invite players." });
    }
    const result = db.createChallenge({ challengerId: player.userId, challengedId: userId, roomCode: room.code, teamId, settings: { overs: room.overs, wickets: room.wickets, maxTeamSize: room.maxTeamSize } });
    if (result.ok) io.to(`user:${userId}`).emit("challenge_received", { id: result.id, roomCode: room.code, teamId, from: { id: player.userId, username: player.username, name: player.name } });
    cb && cb(result);
  });

  // ---------------------------------------------------------- voice (mic)
  // Push-to-talk audio runs peer-to-peer over WebRTC — the server only ever
  // relays handshake payloads (SDP + ICE) between the two players in a room.
  socket.on("voice_signal", ({ data } = {}) => {
    const room = rooms.get(socket.data.room);
    if (teamGame.isTeamRoom(room)) {
      const from = teamGame.playerForSocket(room, socket.id);
      const target = data?.to && room.players[data.to];
      if (!from || !target || !target.connected) return;
      io.to(target.socketId).emit("voice_signal", { from: from.playerId, data });
      return;
    }
    if (!room || room.vsBot) return;
    const role = roleOfSocket(room, socket.id);
    if (!role) return;
    const peer = room.players[otherRole(role)];
    if (!peer || peer.id === "BOT" || !peer.connected) return;
    io.to(peer.id).emit("voice_signal", { from: role, data });
  });

  socket.on("voice_state", ({ talking, scope } = {}) => {
    const room = rooms.get(socket.data.room);
    if (teamGame.isTeamRoom(room)) {
      const from = teamGame.playerForSocket(room, socket.id);
      if (!from) return;
      for (const peer of Object.values(room.players)) {
        if (peer.connected && peer.playerId !== from.playerId) io.to(peer.socketId).emit("voice_state", { from: from.playerId, talking: !!talking, scope: scope === "team" ? "team" : "all" });
      }
      return;
    }
    if (!room || room.vsBot) return;
    const role = roleOfSocket(room, socket.id);
    if (!role) return;
    const peer = room.players[otherRole(role)];
    if (!peer || peer.id === "BOT" || !peer.connected) return;
    io.to(peer.id).emit("voice_state", { from: role, talking: !!talking });
  });

  socket.on("disconnect", () => {
    const code = socket.data.room;
    const room = rooms.get(code);
    if (!room) return;
    if (teamGame.isTeamRoom(room)) {
      const player = teamGame.playerForSocket(room, socket.id);
      if (player) {
        player.connected = false;
        teamGame.sendState(room, io);
      }
      return;
    }
    clearAfk(room);
    const role = roleOfSocket(room, socket.id);
    if (!role) return;
    room.players[role].connected = false;
    broadcast(room);
    if (room.vsBot) {
      // Singleplayer room — no reason to keep it.
      rooms.delete(code);
      return;
    }
    setTimeout(() => {
      const r = rooms.get(code);
      if (!r) return;
      const stillGone =
        (!r.players.p1 || !r.players.p1.connected || r.players.p1.id === "BOT") &&
        (!r.players.p2 || !r.players.p2.connected || r.players.p2.id === "BOT");
      if (stillGone) rooms.delete(code);
    }, 5 * 60 * 1000);
  });
});

// fallback to index.html for any non-API GET (not strictly needed but safe)
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) return next();
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

const PORT = parseInt(process.env.PORT, 10) || 3000; // PORT="0" or empty must fall back to 3000
server.listen(PORT, () => console.log(`Hand Cricket Arena listening on port ${PORT}`));

// ------------------------------------------------------------ keep-alive
// Render's free tier sleeps after ~15 min without traffic, which makes the
// first player after a break wait ~30s. Ping ourselves every 10 min to stay
// awake. Uses RENDER_EXTERNAL_URL (set automatically by Render); set SELF_URL
// manually for any other host. Opt out with NO_KEEP_ALIVE=1.
const SELF_URL = process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL;
if (SELF_URL && !process.env.NO_KEEP_ALIVE) {
  setInterval(() => {
    fetch(`${SELF_URL}/api/health`)
      .then((r) => console.log(`[keep-alive] ${r.status}`))
      .catch((e) => console.log(`[keep-alive] failed: ${e.message}`));
  }, 10 * 60 * 1000);
  console.log(`[keep-alive] pinging ${SELF_URL} every 10 min`);
}
