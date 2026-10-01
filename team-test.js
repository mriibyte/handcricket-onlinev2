// Team-room smoke test. Run with: TEST_PORT=3102 node team-test.js
const io = require("socket.io-client");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const port = parseInt(process.env.TEST_PORT, 10) || 3000;
const base = `http://localhost:${port}`;

async function signup(label) {
  const username = `t${label.toLowerCase()}${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 10)}`.slice(0, 16);
  const response = await fetch(`${base}/api/signup`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, name: label, password: "test1234" }) });
  const result = await response.json();
  if (!result.ok) throw new Error(result.error || "Could not sign up test user.");
  return result;
}

async function waitFor(getter, predicate, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = getter();
    if (predicate(value)) return value;
    await sleep(40);
  }
  throw new Error("Timed out waiting for team state.");
}

(async () => {
  const [hostUser, guestUser] = await Promise.all([signup("Host"), signup("Guest")]);
  const host = io(base);
  const guest = io(base);
  let hostState = null;
  let guestState = null;
  host.on("state", (state) => { hostState = state; });
  guest.on("state", (state) => { guestState = state; });
  await Promise.all([new Promise((resolve) => host.on("connect", resolve)), new Promise((resolve) => guest.on("connect", resolve))]);
  host.emit("hello", { token: hostUser.token });
  guest.emit("hello", { token: guestUser.token });
  const room = await new Promise((resolve, reject) => host.emit("create_room", { mode: "team", token: hostUser.token, name: "Host", overs: 1, wickets: 1, maxTeamSize: 5 }, (result) => result.ok ? resolve(result.code) : reject(new Error(result.error))));
  await new Promise((resolve, reject) => guest.emit("join_room", { code: room, teamId: "B", token: guestUser.token }, (result) => result.ok ? resolve() : reject(new Error(result.error))));
  await waitFor(() => hostState, (state) => state?.teams?.[1]?.players.length === 1);
  host.emit("team_action", { event: "start_match" });
  await waitFor(() => hostState, (state) => state?.phase === "toss_call");
  host.emit("team_action", { event: "toss_call", data: { call: "e" } });
  await waitFor(() => hostState, (state) => state?.phase === "toss_number");
  host.emit("team_action", { event: "toss_number", data: { num: 1 } });
  guest.emit("team_action", { event: "toss_number", data: { num: 1 } });
  await waitFor(() => hostState, (state) => state?.phase === "bat_bowl_choice");
  host.emit("team_action", { event: "bat_bowl_choice", data: { choice: "bat" } });
  await waitFor(() => hostState, (state) => state?.phase === "innings" && state.current?.youCanPick);
  host.emit("team_action", { event: "ball_pick", data: { num: 3 } });
  guest.emit("team_action", { event: "ball_pick", data: { num: 4 } });
  await waitFor(() => hostState, (state) => state?.current?.ballsPlayed === 1);
  if (hostState.current.activeBowler?.playerId !== guestState.current.activeBowler?.playerId) throw new Error("active roster mismatch");
  console.log("TEAM SMOKE PASSED", room);
  host.close(); guest.close();
})().catch((error) => { console.error(error); process.exitCode = 1; });
