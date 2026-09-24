// E2E smoke test: signup → /me → full bot match over socket.io.
// Run against any server with: TEST_PORT=3100 node smoke-test.js
const http = require("http");

const PORT = parseInt(process.env.TEST_PORT, 10) || 3000;

function req(path, { method = "GET", body, token } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      { host: "localhost", port: PORT, path, method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}) } },
      (res) => {
        let out = "";
        res.on("data", (c) => (out += c));
        res.on("end", () => resolve({ status: res.statusCode, json: JSON.parse(out || "{}") }));
      }
    );
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const user = "smoke_" + Date.now().toString(36).slice(-6);
  const pass = "test1234";

  const su = await req("/api/signup", { method: "POST", body: { username: user, password: pass, name: "Smoke" } });
  console.log("signup:", su.status, su.json.ok ? "ok" : JSON.stringify(su.json));
  if (!su.json.ok) process.exit(1);
  const token = su.json.token;

  const me = await req("/api/me", { token });
  console.log("/me:", me.status, "stats.played =", me.json.stats?.played);

  const io = require("socket.io-client");
  const socket = io(`http://localhost:${PORT}`);
  let state = null;
  let roomCode = null;

  socket.on("state", (s) => {
    state = s;
    roomCode = s.code;
  });

  socket.on("connect", () => {
    socket.emit("hello", { token });
    socket.emit("create_room", { name: "Smoke", overs: 1, wickets: 1, difficulty: "medium", token }, (res) => {
      console.log("create_room:", res.ok ? "ok" : res.error, "code", res.code);
    });
  });

  let picksMade = 0;
  const pickIfInnings = () => {
    if (state && state.phase === "innings" && state.current && !state.current.youPicked) {
      picksMade++;
      socket.emit("ball_pick", { num: (picksMade % 6) + 1 });
    }
  };

  const iv = setInterval(pickIfInnings, 150);

  let done = false;
  for (let i = 0; i < 200 && !done; i++) {
    await sleep(100);
    if (state) {
      if (state.phase === "toss_call") socket.emit("toss_call", { call: "e" });
      if (state.phase === "toss_number" && !state.toss.youSubmitted) socket.emit("toss_number", { num: 3 });
      if (state.phase === "bat_bowl_choice" && state.canChooseBatBowl) socket.emit("bat_bowl_choice", { choice: "bat" });
      if (state.phase === "innings_break") socket.emit("start_second_innings");
      if (state.phase === "result") done = true;
    }
  }
  clearInterval(iv);

  if (!done) { console.log("FAIL: match never reached result phase. last phase =", state?.phase); process.exit(1); }

  console.log("match finished. result =", JSON.stringify(state.result));
  await sleep(300);
  const me2 = await req("/api/me", { token });
  console.log("stats after match: played =", me2.json.stats.played, "runs =", me2.json.stats.runs);

  socket.emit("leave_room");
  socket.close();
  console.log(done && me2.json.stats.played === 1 ? "SMOKE TEST PASSED" : "SMOKE TEST FAILED");
  process.exit(me2.json.stats.played === 1 ? 0 : 1);
})().catch((e) => { console.error("ERROR", e); process.exit(1); });
