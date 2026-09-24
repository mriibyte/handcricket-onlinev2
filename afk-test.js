// AFK test: host + joiner. The joiner NEVER emits anything after joining.
// The server's AFK watchdog (6s) must auto-pick for them every turn so the
// match still reaches a result — nobody can stall the room by idling.
// Run against any server with: TEST_PORT=3100 node afk-test.js
const io = require("socket.io-client");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PORT = parseInt(process.env.TEST_PORT, 10) || 3000;

(async () => {
  const host = io(`http://localhost:${PORT}`);
  const joiner = io(`http://localhost:${PORT}`);

  let hostState = null, roomCode = null, ballsResolved = 0, lastSeq = 0;
  host.on("state", (s) => {
    hostState = s;
    roomCode = s.code;
    if (s.lastEventSeq > lastSeq) { lastSeq = s.lastEventSeq; ballsResolved++; }
    // host plays normally
    if (s.phase === "toss_call") host.emit("toss_call", { call: "e" });
    else if (s.phase === "toss_number" && !s.toss.youSubmitted) host.emit("toss_number", { num: 5 });
    else if (s.phase === "bat_bowl_choice" && s.canChooseBatBowl) host.emit("bat_bowl_choice", { choice: "bat" });
    else if (s.phase === "innings" && s.current && !s.current.youPicked) host.emit("ball_pick", { num: (Math.floor(Date.now() / 400) % 6) + 1 });
  });

  await sleep(300);
  host.emit("create_room", { name: "Host", overs: 1, wickets: 1 }, (r) => {
    console.log("create_room:", r.ok ? "ok" : r.error);
    joiner.emit("join_room", { name: "AFK Joiner", code: r.code }, (r2) =>
      console.log("join_room:", r2.ok ? "ok" : r2.error));
  });

  let done = false;
  const t0 = Date.now();
  // Worst case: 6s toss + 6s batbowl + 12 balls × 6s + 6s innings break ≈ 90s
  for (let i = 0; i < 1500 && !done; i++) {
    await sleep(100);
    if (hostState && hostState.phase === "result") done = true;
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log("final phase:", hostState?.phase);
  console.log("result:", JSON.stringify(hostState?.result));
  console.log("balls resolved while joiner was silent:", ballsResolved);
  console.log("elapsed:", elapsed + "s");

  host.close(); joiner.close();
  const ok = done && ballsResolved > 0;
  console.log(ok ? "AFK TEST PASSED" : "AFK TEST FAILED");
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
