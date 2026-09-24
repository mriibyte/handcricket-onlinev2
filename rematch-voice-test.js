// Rematch consent + voice relay test.
// 1. Host + joiner play a match (joiner silent → AFK carries it) to a result.
// 2. Host proposes rematch → both see the pending request, phase must NOT change.
// 3. Joiner accepts → match resets to toss_call.
// 4. Second match runs to a result; joiner proposes this time; host declines →
//    joiner sees "declined", phase stays result.
// 5. voice_state / voice_signal relay from host reaches the joiner.
// Run with: TEST_PORT=3100 node rematch-voice-test.js
const io = require("socket.io-client");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PORT = parseInt(process.env.TEST_PORT, 10) || 3000;
let failures = 0;
const check = (name, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}: ${name}`);
  if (!cond) failures++;
};

(async () => {
  const host = io(`http://localhost:${PORT}`);
  const joiner = io(`http://localhost:${PORT}`);

  let hostState = null;
  let joinerState = null;
  let voiceRelayed = null;
  let talkingRelayed = null;

  const play = (s, emit) => {
    if (s.phase === "toss_call") emit("toss_call", { call: "e" });
    else if (s.phase === "toss_number" && !s.toss.youSubmitted) emit("toss_number", { num: 5 });
    else if (s.phase === "bat_bowl_choice" && s.canChooseBatBowl) emit("bat_bowl_choice", { choice: "bat" });
    else if (s.phase === "innings" && s.current && !s.current.youPicked) emit("ball_pick", { num: 3 });
  };

  host.on("state", (s) => {
    hostState = s;
    if (s.phase !== "result" || !s.rematch || s.rematch.declinedBy) play(s, (e, d) => host.emit(e, d));
  });
  joiner.on("state", (s) => {
    joinerState = s;
  });
  joiner.on("voice_signal", (p) => (voiceRelayed = p));
  joiner.on("voice_state", (p) => (talkingRelayed = p));

  await sleep(300);
  host.emit("create_room", { name: "Host", overs: 1, wickets: 1 }, (r) => {
    console.log("create_room:", r.ok ? "ok" : r.error);
    joiner.emit("join_room", { name: "Joiner", code: r.code }, (r2) => console.log("join_room:", r2.ok ? "ok" : r2.error));
  });

  const waitPhase = async (getter, phase, ms) => {
    for (let i = 0; i * 100 < ms; i++) {
      const p = getter()?.phase;
      if (phase === "__leave_result__" ? p && p !== "result" : p === phase) return true;
      await sleep(100);
    }
    return false;
  };

  // match 1: joiner is silent → AFK auto-pick carries it to a result
  const m1 = await waitPhase(() => hostState, "result", 120000);
  check("match 1 reaches a result with silent joiner", m1);
  console.log("   result:", JSON.stringify(hostState?.result));

  // host proposes a rematch
  host.emit("rematch");
  await sleep(400);
  check("host sees pending rematch request (requestIsMine)", hostState?.rematch?.pending === true && hostState?.rematch?.requestIsMine === true);
  check("joiner sees pending rematch request", joinerState?.rematch?.pending === true && joinerState?.rematch?.requestIsMine === false);
  check("phase still result while waiting for consent", hostState?.phase === "result" && joinerState?.phase === "result");

  // joiner accepts → match resets (host instantly calls the toss, so accept
  // any post-result phase as proof of the reset)
  joiner.emit("rematch_response", { accept: true });
  const reset = await waitPhase(() => joinerState, "__leave_result__", 3000);
  check("joiner accept resets match (phase left result)", reset);

  // match 2: host is silent now; joiner plays
  joiner.on("state", (s) => {
    joinerState = s;
    if (s.phase !== "result" || !s.rematch || s.rematch.declinedBy) play(s, (e, d) => joiner.emit(e, d));
  });
  host.off("state");
  host.on("state", (s) => (hostState = s));
  const m2 = await waitPhase(() => hostState, "result", 120000);
  check("match 2 reaches a result with silent host", m2);

  // joiner proposes, host declines
  joiner.emit("rematch");
  await sleep(400);
  check("second request pending on host side", hostState?.rematch?.pending === true && hostState?.rematch?.requestIsMine === false);
  host.emit("rematch_response", { accept: false });
  await sleep(400);
  check("decline marks declinedByOpponent for joiner", joinerState?.rematch?.declinedByOpponent === true && joinerState?.rematch?.pending === false);
  check("decline keeps phase at result", joinerState?.phase === "result" && hostState?.phase === "result");

  // voice relay (signaling only — no real WebRTC in node)
  const hostRoom = "X";
  hostState && host.emit("voice_signal", { data: { type: "ping", from: hostRoom } });
  host.emit("voice_state", { talking: true });
  await sleep(300);
  check("voice_signal relayed to the opponent", !!voiceRelayed && voiceRelayed.from === "p1");
  check("voice_state relayed with talking=true", !!talkingRelayed && talkingRelayed.talking === true);

  host.close();
  joiner.close();
  console.log(failures === 0 ? "REMATCH+VOICE TEST PASSED" : `REMATCH+VOICE TEST FAILED (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
