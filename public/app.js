const socket = io();

// ---------- element refs ----------
const screens = {
  home: document.getElementById("screen-home"),
  lobby: document.getElementById("screen-lobby"),
  match: document.getElementById("screen-match"),
};
const homeError = document.getElementById("home-error");
const lobbyCode = document.getElementById("lobby-code");
const lobbyStatus = document.getElementById("lobby-status");
const stage = document.getElementById("stage");
const logEl = document.getElementById("log");

const tb = {
  runs: document.getElementById("tb-runs"),
  wkts: document.getElementById("tb-wkts"),
  balls: document.getElementById("tb-balls"),
  maxballs: document.getElementById("tb-maxballs"),
  targetWrap: document.getElementById("tb-target-wrap"),
  target: document.getElementById("tb-target"),
  you: document.getElementById("tb-you"),
  opp: document.getElementById("tb-opp"),
};

const modalOverlay = document.getElementById("modal-overlay");
const modalIcon = document.getElementById("modal-icon");
const modalTitle = document.getElementById("modal-title");
const modalBody = document.getElementById("modal-body");
const modalClose = document.getElementById("modal-close");

let myPickedThisBall = false;
let lastEventKey = null; // avoid showing the same popup twice
let lastLoggedBallKey = null;
let currentState = null;
let roomCode = null;

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.add("hidden"));
  screens[name].classList.remove("hidden");
}

function logLine(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}

// ---------- HOME: create / join ----------
document.getElementById("btn-create").addEventListener("click", () => {
  homeError.textContent = "";
  const name = document.getElementById("create-name").value.trim() || "Player 1";
  const overs = document.getElementById("create-overs").value;
  const wickets = document.getElementById("create-wickets").value;
  socket.emit("create_room", { name, overs, wickets }, (res) => {
    if (!res.ok) return (homeError.textContent = res.error || "Could not create room.");
    roomCode = res.code;
    lobbyCode.textContent = res.code;
    lobbyStatus.textContent = "Waiting for opponent to join…";
    showScreen("lobby");
  });
});

document.getElementById("btn-join").addEventListener("click", () => {
  homeError.textContent = "";
  const name = document.getElementById("join-name").value.trim() || "Player 2";
  const code = document.getElementById("join-code").value.trim().toUpperCase();
  if (!code) return (homeError.textContent = "Enter a room code.");
  socket.emit("join_room", { name, code }, (res) => {
    if (!res.ok) return (homeError.textContent = res.error || "Could not join room.");
    roomCode = res.code;
    showScreen("match");
  });
});

modalClose.addEventListener("click", () => modalOverlay.classList.add("hidden"));

function popup(icon, title, body) {
  modalIcon.textContent = icon;
  modalTitle.textContent = title;
  modalBody.innerHTML = body;
  modalOverlay.classList.remove("hidden");
}

// ---------- socket state ----------
socket.on("state", (state) => {
  currentState = state;
  render(state);
});

function render(state) {
  // topbar names
  tb.you.textContent = state.you.name || "You";
  tb.opp.textContent = state.opponent ? state.opponent.name : "…waiting";

  if (state.current) {
    tb.runs.textContent = state.current.runs;
    tb.wkts.textContent = state.wickets - state.current.wicketsLeft;
    tb.balls.textContent = state.current.ballsPlayed;
    tb.maxballs.textContent = state.balls;
  } else {
    tb.runs.textContent = 0;
    tb.wkts.textContent = 0;
    tb.balls.textContent = 0;
    tb.maxballs.textContent = state.balls;
  }
  if (state.target !== null && state.target !== undefined) {
    tb.targetWrap.classList.remove("hidden");
    tb.target.textContent = state.target + 1;
  } else {
    tb.targetWrap.classList.add("hidden");
  }

  // waiting for opponent to join
  if (!state.opponent) {
    lobbyCode.textContent = state.code;
    lobbyStatus.textContent = "Waiting for opponent to join…";
    showScreen("lobby");
    return;
  }
  showScreen("match");

  // opponent disconnected mid-match
  if (state.opponent && !state.opponent.connected && state.phase !== "result") {
    stage.innerHTML = `<p class="info">⚠️ ${escapeHtml(state.opponent.name)} disconnected. Waiting for them to reconnect…</p>`;
  }

  switch (state.phase) {
    case "toss_call":
      renderTossCall(state);
      break;
    case "toss_number":
      renderTossNumber(state);
      break;
    case "bat_bowl_choice":
      renderBatBowlChoice(state);
      break;
    case "innings":
      renderInnings(state);
      break;
    case "innings_break":
      renderInningsBreak(state);
      break;
    case "result":
      renderResult(state);
      break;
    default:
      stage.innerHTML = `<p class="info">Loading…</p>`;
  }

  handlePopup(state);
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

// ---------- phase renderers ----------
function renderTossCall(state) {
  if (state.tossCallerIsYou) {
    stage.innerHTML = `
      <h2>Toss</h2>
      <p class="info">Call it — Even or Odd?</p>
      <div class="choice-row">
        <button class="btn primary" id="call-e">Even</button>
        <button class="btn primary" id="call-o">Odd</button>
      </div>`;
    document.getElementById("call-e").onclick = () => socket.emit("toss_call", { call: "e" });
    document.getElementById("call-o").onclick = () => socket.emit("toss_call", { call: "o" });
  } else {
    stage.innerHTML = `
      <h2>Toss</h2>
      <p class="info">${escapeHtml(state.opponent.name)} is calling Even or Odd…</p>
      <div class="wait-badge">Hang tight ⏳</div>`;
  }
}

function renderTossNumber(state) {
  const callText = state.toss.call === "e" ? "Even" : "Odd";
  stage.innerHTML = `
    <h2>Toss — ${callText} called</h2>
    <p class="info">Pick a secret number 1–10</p>
    <div class="numgrid" id="toss-grid"></div>
    <div class="wait-badge" id="toss-wait" style="display:none">Waiting for opponent's pick…</div>
  `;
  const grid = document.getElementById("toss-grid");
  for (let i = 1; i <= 10; i++) {
    const b = document.createElement("button");
    b.className = "numbtn";
    b.textContent = i;
    b.disabled = state.toss.youSubmitted;
    b.onclick = () => {
      socket.emit("toss_number", { num: i });
      Array.from(grid.children).forEach((c) => (c.disabled = true));
      b.classList.add("picked");
      document.getElementById("toss-wait").style.display = "block";
    };
    grid.appendChild(b);
  }
  if (state.toss.youSubmitted) {
    document.getElementById("toss-wait").style.display = "block";
  }
}

function renderBatBowlChoice(state) {
  stage.innerHTML = `
    <h2>Toss won!</h2>
    <p class="info" id="bb-info">Deciding who bats first…</p>
    <div class="choice-row hidden" id="bb-buttons">
      <button class="btn primary" id="bb-bat">Bat first</button>
      <button class="btn primary" id="bb-bowl">Bowl first</button>
    </div>
  `;
  if (state.canChooseBatBowl) {
    document.getElementById("bb-info").textContent = "You won the toss! Bat or bowl first?";
    document.getElementById("bb-buttons").classList.remove("hidden");
    document.getElementById("bb-bat").onclick = () => socket.emit("bat_bowl_choice", { choice: "bat" });
    document.getElementById("bb-bowl").onclick = () => socket.emit("bat_bowl_choice", { choice: "bowl" });
  } else {
    document.getElementById("bb-info").textContent =
      `${escapeHtml(state.opponent.name)} won the toss and is choosing to bat or bowl…`;
  }
}

function renderInnings(state) {
  const battingText = state.current.battingSide === "you" ? "You are batting" : "You are bowling";
  const alreadyPicked = state.current.youPicked;

  stage.innerHTML = `
    <h2>Innings ${state.inningsNo}</h2>
    <p class="info">${battingText} — pick a number 1–6</p>
    <div class="numgrid six" id="ball-grid"></div>
    <div class="wait-badge" id="ball-wait" style="display:${alreadyPicked ? "block" : "none"}">
      Waiting for opponent's pick…
    </div>
  `;
  const grid = document.getElementById("ball-grid");
  for (let i = 1; i <= 6; i++) {
    const b = document.createElement("button");
    b.className = "numbtn";
    b.textContent = i;
    b.disabled = alreadyPicked;
    b.onclick = () => {
      socket.emit("ball_pick", { num: i });
      Array.from(grid.children).forEach((c) => (c.disabled = true));
      b.classList.add("picked");
      document.getElementById("ball-wait").style.display = "block";
    };
    grid.appendChild(b);
  }
}

function renderInningsBreak(state) {
  const who = state.firstInningsSummary.isYou ? "You" : escapeHtml(state.opponent.name);
  stage.innerHTML = `
    <h2>End of Innings 1</h2>
    <div class="scoreboard">
      <div><div>${who} scored</div><div class="big">${state.firstInningsSummary.runs}</div></div>
      <div><div>Target</div><div class="big">${state.firstInningsSummary.runs + 1}</div></div>
    </div>
    <button class="btn primary" id="start-2nd">Start Innings 2</button>
  `;
  document.getElementById("start-2nd").onclick = () => socket.emit("start_second_innings");
}

function renderResult(state) {
  const r = state.result;
  const myRuns = state.you.role === "p1" ? r.p1Runs : r.p2Runs;
  const oppRuns = state.you.role === "p1" ? r.p2Runs : r.p1Runs;

  let bannerClass = "tie";
  let title = "It's a Tie! 🤝";
  if (r.winner === state.you.role) {
    bannerClass = "win";
    title = "You Won! 🏆";
  } else if (r.winner) {
    bannerClass = "lose";
    title = "You Lost 💔";
  }

  stage.innerHTML = `
    <div class="result-banner ${bannerClass}">${title}</div>
    <div class="scoreboard">
      <div><div>You</div><div class="big">${myRuns}</div></div>
      <div><div>${escapeHtml(state.opponent.name)}</div><div class="big">${oppRuns}</div></div>
    </div>
    <button class="btn primary" id="rematch">Play Again</button>
  `;
  document.getElementById("rematch").onclick = () => socket.emit("rematch");
}

// ---------- popups for wickets / target ----------
function handlePopup(state) {
  if (!state.lastEvent) return;
  const key = `${state.inningsNo}-${state.current ? state.current.ballsPlayed : "x"}-${state.phase}`;
  if (key === lastEventKey) return;
  lastEventKey = key;

  const ev = state.lastEvent;
  const whoBatted = ev.isYou ? "You" : (state.opponent ? state.opponent.name : "Opponent");

  if (ev.reachedTarget) {
    popup("🎯", "Target Reached!", `${escapeHtml(whoBatted)} chased down the target. Innings over!`);
    logLine(`<span class="me">🎯 ${escapeHtml(whoBatted)} reached the target — innings over.</span>`);
  } else if (ev.type === "wicket") {
    const extra = ev.allOut ? " That's the last wicket — all out!" : "";
    popup("🏏💥", "WICKET!", `${escapeHtml(whoBatted)} picked the same number as the bowler and lost a wicket.${extra}`);
    logLine(`❌ ${escapeHtml(whoBatted)} is out! (${ev.batterNum} = ${ev.bowlerNum})`);
  } else {
    logLine(`${escapeHtml(whoBatted)} scored ${ev.runsAdded} run${ev.runsAdded === 1 ? "" : "s"}.`);
  }
}
