const crypto = require("crypto");

const TEAM_IDS = ["A", "B"];
const AFK_MS = 6000;

const id = () => crypto.randomUUID();
const otherTeam = (teamId) => (teamId === "A" ? "B" : "A");

function createRoom({ code, socketId, user, name, overs, wickets, maxTeamSize = 5 }) {
  const playerId = id();
  const player = {
    playerId,
    userId: user?.id || null,
    username: user?.username || null,
    name: String(name || user?.name || "Player").slice(0, 20),
    socketId,
    connected: true,
    ready: false,
    teamId: "A",
    afkCount: 0,
  };
  return {
    mode: "team",
    code,
    hostPlayerId: playerId,
    overs,
    wickets,
    balls: overs * 6,
    maxTeamSize: Math.max(1, Math.min(5, Number(maxTeamSize) || 5)),
    phase: "lobby",
    teams: {
      A: { id: "A", name: "Team A", captainPlayerId: playerId, playerIds: [playerId] },
      B: { id: "B", name: "Team B", captainPlayerId: null, playerIds: [] },
    },
    players: { [playerId]: player },
    toss: { call: null, numbers: { A: null, B: null }, autoPick: { A: false, B: false }, winnerTeamId: null },
    inningsNo: 1,
    battingFirstTeamId: null,
    target: null,
    current: null,
    firstInningsSummary: null,
    lastEvent: null,
    lastEventSeq: 0,
    result: null,
    resultRecorded: false,
    afkTimer: null,
    rematch: null,
  };
}

function isTeamRoom(room) { return room?.mode === "team"; }
function playerForSocket(room, socketId) {
  return Object.values(room.players).find((player) => player.socketId === socketId) || null;
}
function roleOfSocket(room, socketId) {
  return playerForSocket(room, socketId)?.playerId || null;
}
function teamOfPlayer(room, playerId) {
  return room.players[playerId]?.teamId || null;
}
function captain(room, teamId) {
  return room.players[room.teams[teamId]?.captainPlayerId] || null;
}
function connectedPlayers(room) {
  return Object.values(room.players).filter((player) => player.connected);
}
function clearTimer(room) {
  if (room.afkTimer) clearTimeout(room.afkTimer);
  room.afkTimer = null;
}

function sendState(room, io) {
  for (const player of connectedPlayers(room)) {
    io.to(player.socketId).emit("state", publicState(room, player.playerId));
  }
}

function addPlayer(room, { socketId, user, name, teamId }) {
  teamId = TEAM_IDS.includes(teamId) ? teamId : (room.teams.B.playerIds.length ? "A" : "B");
  if (room.teams[teamId].playerIds.length >= room.maxTeamSize) return { ok: false, error: "That team is full." };
  const playerId = id();
  const player = {
    playerId,
    userId: user?.id || null,
    username: user?.username || null,
    name: String(name || user?.name || "Player").slice(0, 20),
    socketId,
    connected: true,
    ready: false,
    teamId,
    afkCount: 0,
  };
  room.players[playerId] = player;
  room.teams[teamId].playerIds.push(playerId);
  if (!room.teams[teamId].captainPlayerId) room.teams[teamId].captainPlayerId = playerId;
  return { ok: true, player };
}

function movePlayer(room, playerId, teamId) {
  const player = room.players[playerId];
  if (!player || !TEAM_IDS.includes(teamId) || room.phase !== "lobby") return { ok: false, error: "Team change unavailable." };
  if (player.teamId === teamId) return { ok: true };
  if (room.teams[teamId].playerIds.length >= room.maxTeamSize) return { ok: false, error: "That team is full." };
  const oldTeamId = player.teamId;
  room.teams[oldTeamId].playerIds = room.teams[oldTeamId].playerIds.filter((id) => id !== playerId);
  if (room.teams[oldTeamId].captainPlayerId === playerId) room.teams[oldTeamId].captainPlayerId = room.teams[oldTeamId].playerIds[0] || null;
  room.teams[teamId].playerIds.push(playerId);
  player.teamId = teamId;
  if (!room.teams[teamId].captainPlayerId) room.teams[teamId].captainPlayerId = playerId;
  return { ok: true };
}

function resetMatch(room) {
  clearTimer(room);
  room.phase = "toss_call";
  room.toss = { call: null, numbers: { A: null, B: null }, autoPick: { A: false, B: false }, winnerTeamId: null };
  room.inningsNo = 1;
  room.battingFirstTeamId = null;
  room.target = null;
  room.current = null;
  room.firstInningsSummary = null;
  room.lastEvent = null;
  room.result = null;
  room.resultRecorded = false;
  room.rematch = null;
}

function startInnings(room, battingTeamId, target) {
  clearTimer(room);
  const battingPlayers = room.teams[battingTeamId].playerIds.filter((playerId) => room.players[playerId]?.connected);
  const bowlingTeamId = otherTeam(battingTeamId);
  const bowlingPlayers = room.teams[bowlingTeamId].playerIds.filter((playerId) => room.players[playerId]?.connected);
  room.current = {
    battingTeamId,
    bowlingTeamId,
    runs: 0,
    wicketsLeft: Math.min(room.wickets, battingPlayers.length),
    ballsPlayed: 0,
    battingOrder: battingPlayers,
    bowlingOrder: bowlingPlayers,
    batterIndex: 0,
    bowlerIndex: 0,
    dismissed: [],
    activeBatterId: battingPlayers[0] || null,
    activeBowlerId: bowlingPlayers[0] || null,
    picks: {},
    autoPicked: {},
  };
  room.target = target;
  room.phase = "innings";
  room.lastEvent = null;
  scheduleBall(room);
}

function nextBatter(room) {
  const current = room.current;
  while (++current.batterIndex < current.battingOrder.length) {
    const candidate = current.battingOrder[current.batterIndex];
    if (!current.dismissed.includes(candidate)) {
      current.activeBatterId = candidate;
      return true;
    }
  }
  current.activeBatterId = null;
  return false;
}

function advanceBowler(room) {
  const current = room.current;
  if (!current.bowlingOrder.length) return;
  current.bowlerIndex = (current.bowlerIndex + 1) % current.bowlingOrder.length;
  current.activeBowlerId = current.bowlingOrder[current.bowlerIndex];
}

function finishInnings(room, battingTeamId) {
  clearTimer(room);
  if (room.inningsNo === 1) {
    room.firstInningsSummary = { teamId: battingTeamId, runs: room.current.runs, wickets: room.wickets - room.current.wicketsLeft, balls: room.current.ballsPlayed };
    room.phase = "innings_break";
    room.afkTimer = setTimeout(() => {
      if (room.phase !== "innings_break") return;
      room.inningsNo = 2;
      startInnings(room, otherTeam(battingTeamId), room.firstInningsSummary.runs);
      room.onChange?.();
    }, AFK_MS);
  } else {
    const firstTeam = room.firstInningsSummary.teamId;
    const secondTeam = otherTeam(firstTeam);
    const scores = { A: 0, B: 0 };
    scores[firstTeam] = room.firstInningsSummary.runs;
    scores[secondTeam] = room.current.runs;
    const winnerTeamId = scores.A === scores.B ? null : (scores.A > scores.B ? "A" : "B");
    room.result = { winnerTeamId, scores, margin: winnerTeamId ? Math.abs(scores.A - scores.B) : null, marginType: "runs" };
    room.phase = "result";
  }
}

function resolveBall(room) {
  clearTimer(room);
  const current = room.current;
  const batterNum = current.picks[current.activeBatterId];
  const bowlerNum = current.picks[current.activeBowlerId];
  const batter = room.players[current.activeBatterId];
  const bowler = room.players[current.activeBowlerId];
  const event = {
    seq: ++room.lastEventSeq,
    type: batterNum === bowlerNum ? "wicket" : "runs",
    batterPlayerId: batter.playerId,
    bowlerPlayerId: bowler.playerId,
    batterName: batter.name,
    bowlerName: bowler.name,
    batterNum,
    bowlerNum,
    side: current.battingTeamId,
  };
  if (batterNum === bowlerNum) {
    current.wicketsLeft -= 1;
    current.dismissed.push(current.activeBatterId);
    event.allOut = !nextBatter(room);
  } else {
    current.runs += batterNum;
    event.runsAdded = batterNum;
  }
  current.ballsPlayed += 1;
  current.picks = {};
  current.autoPicked = {};
  if (current.ballsPlayed % 6 === 0) advanceBowler(room);
  const targetReached = room.target !== null && current.runs > room.target;
  const allOut = current.wicketsLeft <= 0 || !current.activeBatterId;
  const oversDone = current.ballsPlayed >= room.balls;
  if (targetReached) event.reachedTarget = true;
  room.lastEvent = event;
  if (targetReached || allOut || oversDone) finishInnings(room, current.battingTeamId);
  else scheduleBall(room);
}

function scheduleBall(room) {
  clearTimer(room);
  room.afkTimer = setTimeout(() => {
    if (room.phase !== "innings" || !room.current) return;
    const current = room.current;
    [current.activeBatterId, current.activeBowlerId].forEach((playerId) => {
      if (playerId && current.picks[playerId] == null) {
        current.picks[playerId] = 1 + Math.floor(Math.random() * 6);
        current.autoPicked[playerId] = true;
        room.players[playerId].afkCount += 1;
      }
    });
    resolveBall(room);
    room.onChange?.();
  }, AFK_MS);
}

function handle(room, playerId, event, data = {}) {
  const player = room.players[playerId];
  if (!player) return { ok: false, error: "Player not found." };
  if (event === "team_select") return movePlayer(room, playerId, data.teamId);
  if (event === "lobby_ready") {
    if (room.phase !== "lobby") return { ok: false, error: "Lobby is closed." };
    player.ready = data.ready !== false;
    return { ok: true };
  }
  if (event === "start_match") {
    if (room.phase !== "lobby" || playerId !== room.hostPlayerId) return { ok: false, error: "Only the host can start the room." };
    if (!room.teams.A.playerIds.length || !room.teams.B.playerIds.length) return { ok: false, error: "Both teams need at least one player." };
    room.phase = "toss_call";
    return { ok: true };
  }
  if (event === "toss_call") {
    if (room.phase !== "toss_call" || playerId !== room.teams.A.captainPlayerId || !["e", "o"].includes(data.call)) return { ok: false, error: "Only Team A's captain calls the toss." };
    room.toss.call = data.call;
    room.phase = "toss_number";
    return { ok: true };
  }
  if (event === "toss_number") {
    const teamId = player.teamId;
    if (room.phase !== "toss_number" || playerId !== room.teams[teamId].captainPlayerId || room.toss.numbers[teamId] !== null) return { ok: false, error: "Only your team captain can submit." };
    const num = Number(data.num);
    if (num < 1 || num > 10) return { ok: false, error: "Pick a number from 1 to 10." };
    room.toss.numbers[teamId] = num;
    if (room.toss.numbers.A !== null && room.toss.numbers.B !== null) {
      const parity = (room.toss.numbers.A + room.toss.numbers.B) % 2 === 0 ? "e" : "o";
      room.toss.winnerTeamId = parity === room.toss.call ? "A" : "B";
      room.phase = "bat_bowl_choice";
    }
    return { ok: true };
  }
  if (event === "bat_bowl_choice") {
    const winner = room.toss.winnerTeamId;
    if (room.phase !== "bat_bowl_choice" || playerId !== room.teams[winner].captainPlayerId || !["bat", "bowl"].includes(data.choice)) return { ok: false, error: "Only the toss-winning captain can choose." };
    room.battingFirstTeamId = data.choice === "bat" ? winner : otherTeam(winner);
    room.inningsNo = 1;
    startInnings(room, room.battingFirstTeamId, null);
    return { ok: true };
  }
  if (event === "ball_pick") {
    if (room.phase !== "innings" || !room.current || ![room.current.activeBatterId, room.current.activeBowlerId].includes(playerId)) return { ok: false, error: "You are not active this ball." };
    const num = Number(data.num);
    if (num < 1 || num > 6 || room.current.picks[playerId] != null) return { ok: false, error: "Invalid pick." };
    clearTimer(room);
    room.current.picks[playerId] = num;
    if (room.current.picks[room.current.activeBatterId] != null && room.current.picks[room.current.activeBowlerId] != null) resolveBall(room);
    else scheduleBall(room);
    return { ok: true };
  }
  if (event === "start_second_innings") {
    if (room.phase !== "innings_break") return { ok: false, error: "Not at innings break." };
    room.inningsNo = 2;
    startInnings(room, otherTeam(room.firstInningsSummary.teamId), room.firstInningsSummary.runs);
    return { ok: true };
  }
  if (event === "rematch") {
    if (room.phase !== "result") return { ok: false, error: "Match is not finished." };
    resetMatch(room);
    return { ok: true };
  }
  return { ok: false, error: "Unknown team action." };
}

function publicState(room, forPlayerId) {
  const me = room.players[forPlayerId];
  const safePlayer = (player, extras = {}) => player ? {
    playerId: player.playerId, userId: player.userId, username: player.username,
    name: player.name, connected: player.connected, ready: player.ready,
    teamId: player.teamId, afkCount: player.afkCount, ...extras,
  } : null;
  const current = room.current ? {
    battingTeamId: room.current.battingTeamId,
    bowlingTeamId: room.current.bowlingTeamId,
    runs: room.current.runs,
    wicketsLeft: room.current.wicketsLeft,
    ballsPlayed: room.current.ballsPlayed,
    over: Math.floor(room.current.ballsPlayed / 6),
    ballInOver: room.current.ballsPlayed % 6,
    activeBatter: safePlayer(room.players[room.current.activeBatterId], { isYou: room.current.activeBatterId === forPlayerId }),
    activeBowler: safePlayer(room.players[room.current.activeBowlerId], { isYou: room.current.activeBowlerId === forPlayerId }),
    youCanPick: [room.current.activeBatterId, room.current.activeBowlerId].includes(forPlayerId),
    youPicked: room.current.picks[forPlayerId] != null,
    batterPicked: room.current.picks[room.current.activeBatterId] != null,
    bowlerPicked: room.current.picks[room.current.activeBowlerId] != null,
  } : null;
  return {
    schemaVersion: 2,
    mode: "team",
    code: room.code,
    phase: room.phase,
    overs: room.overs,
    wickets: room.wickets,
    balls: room.balls,
    maxTeamSize: room.maxTeamSize,
    you: safePlayer(me, { isCaptain: room.teams[me.teamId].captainPlayerId === me.playerId }),
    hostPlayerId: room.hostPlayerId,
    teams: TEAM_IDS.map((teamId) => ({
      ...room.teams[teamId],
      players: room.teams[teamId].playerIds.map((playerId) => ({
        ...safePlayer(room.players[playerId], {
          isCaptain: room.teams[teamId].captainPlayerId === playerId,
          isActiveBatter: room.current?.activeBatterId === playerId,
          isActiveBowler: room.current?.activeBowlerId === playerId,
        }),
      })),
    })),
    toss: {
      call: room.toss.call,
      callerTeamId: "A",
      winnerTeamId: room.toss.winnerTeamId,
      teams: { A: { submitted: room.toss.numbers.A !== null, autoPicked: room.toss.autoPick.A }, B: { submitted: room.toss.numbers.B !== null, autoPicked: room.toss.autoPick.B } },
      youCanSubmit: room.phase === "toss_number" && me && room.teams[me.teamId].captainPlayerId === forPlayerId,
    },
    battingFirstTeamId: room.battingFirstTeamId,
    inningsNo: room.inningsNo,
    target: room.target,
    current,
    firstInningsSummary: room.firstInningsSummary,
    lastEvent: room.lastEvent,
    lastEventSeq: room.lastEventSeq,
    result: room.result,
  };
}

module.exports = { isTeamRoom, createRoom, addPlayer, roleOfSocket, playerForSocket, publicState, sendState, handle, resetMatch };
