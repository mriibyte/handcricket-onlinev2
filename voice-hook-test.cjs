// Deterministic hook-level WebRTC tests. Run: node --test voice-hook-test.cjs
// No browser/device audio is simulated; these verify lifecycle and protocol behavior.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { transformSync } = require("esbuild");

const source = transformSync(fs.readFileSync(path.join(__dirname, "client/useVoice.js"), "utf8"), {
  format: "cjs", loader: "js", define: { "import.meta.env.VITE_SERVER_URL": '"https://voice.example/"' },
}).code;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
const state = (role) => ({ you: { role }, opponent: { connected: true } });

function environment() {
  let rendering, sequence = 0;
  const intervals = new Map();
  const timeouts = new Map();
  const pcs = [];
  const requests = [];
  const fetches = [];
  const config = [{ urls: "turn:relay.example:3478", username: "short-lived", credential: "test-only" }];
  class Stream {
    constructor(tracks = []) { this.tracks = tracks; }
    getTracks() { return this.tracks; }
    getAudioTracks() { return this.tracks.filter((track) => track.kind === "audio"); }
  }
  class PC {
    constructor(options) {
      this.options = options;
      this.signalingState = "stable";
      this.connectionState = "new";
      this.candidates = [];
      this.events = [];
      this.sender = {
        track: null,
        replaceTrack: async (track) => {
          this.events.push(["replace", track]);
          if (this.replaceGate) await this.replaceGate.promise;
          if (this.connectionState === "closed") throw new Error("closed");
          this.sender.track = track;
        },
      };
      pcs.push(this);
    }
    addTransceiver(kind, options) {
      assert.equal(kind, "audio");
      assert.equal(options.direction, "sendrecv");
      return { sender: this.sender };
    }
    async createOffer() { return { type: "offer", sdp: "a=ice-ufrag:ours\r\n" }; }
    async createAnswer() { return { type: "answer", sdp: "a=ice-ufrag:ours\r\n" }; }
    async setLocalDescription(sdp) {
      this.events.push(["local", sdp.type]);
      if (sdp.type === "rollback") { this.signalingState = "stable"; this.localDescription = null; return; }
      assert.notEqual(this.connectionState, "closed");
      if (sdp.type === "offer") assert.equal(this.signalingState, "stable");
      if (sdp.type === "answer") assert.equal(this.signalingState, "have-remote-offer");
      this.localDescription = sdp;
      this.signalingState = sdp.type === "offer" ? "have-local-offer" : "stable";
    }
    async setRemoteDescription(sdp) {
      this.events.push(["remote", sdp.type]);
      if (sdp.type === "offer") assert.equal(this.signalingState, "stable", "rollback must finish before remote offer");
      if (sdp.type === "answer") assert.equal(this.signalingState, "have-local-offer");
      this.remoteDescription = sdp;
      this.signalingState = sdp.type === "offer" ? "have-remote-offer" : "stable";
    }
    async addIceCandidate(candidate) { assert.ok(this.remoteDescription); this.candidates.push(candidate); }
    connect() { this.connectionState = "connected"; this.onconnectionstatechange?.(); }
    close() { this.connectionState = "closed"; this.signalingState = "closed"; }
  }
  class Socket {
    constructor(role) { this.role = role; this.connected = true; this.listeners = new Map(); this.sent = []; }
    on(event, callback) { if (!this.listeners.has(event)) this.listeners.set(event, new Set()); this.listeners.get(event).add(callback); }
    off(event, callback) { this.listeners.get(event)?.delete(callback); }
    receive(event, payload) { this.listeners.get(event)?.forEach((callback) => callback(payload)); }
    emit(event, payload) {
      this.sent.push({ event, ...payload });
      if (this.peer?.connected) this.peer.receive(event, { from: this.role, ...payload });
    }
  }
  const hooks = {
    useState(initial) {
      const instance = rendering, index = instance.index++;
      if (!(index in instance.slots)) instance.slots[index] = initial;
      return [instance.slots[index], (value) => {
        if (instance.unmounted) instance.lateUpdates++;
        instance.slots[index] = typeof value === "function" ? value(instance.slots[index]) : value;
      }];
    },
    useRef(initial) {
      const instance = rendering, index = instance.index++;
      return instance.slots[index] ||= { current: initial };
    },
    useCallback(callback, deps) {
      const instance = rendering, index = instance.index++;
      const old = instance.slots[index];
      if (!old || deps.some((dep, i) => dep !== old.deps[i])) instance.slots[index] = { callback, deps };
      return instance.slots[index].callback;
    },
    useEffect(callback, deps) {
      const instance = rendering, index = instance.index++;
      const old = instance.slots[index];
      if (!old || deps.some((dep, i) => dep !== old.deps[i])) {
        instance.pending.push(() => { old?.cleanup?.(); instance.slots[index] = { deps, cleanup: callback() }; });
      }
    },
  };
  const context = {
    module: { exports: {} }, exports: {}, require: (name) => { assert.equal(name, "react"); return hooks; },
    RTCPeerConnection: PC, MediaStream: Stream, AbortController,
    crypto: { randomUUID: () => `session-${++sequence}` },
    setInterval: (callback) => { const id = ++sequence; intervals.set(id, callback); return id; },
    clearInterval: (id) => intervals.delete(id),
    setTimeout: (callback) => { const id = ++sequence; timeouts.set(id, callback); return id; },
    clearTimeout: (id) => timeouts.delete(id),
    fetch: async (url, options) => { fetches.push({ url, options }); return { ok: true, json: async () => ({ iceServers: config }) }; },
    navigator: { mediaDevices: { getUserMedia: () => { const request = deferred(); requests.push(request); return request.promise; } } },
  };
  vm.runInNewContext(source, context);
  const useVoice = context.module.exports.default;
  const mount = (socket, initialState = state(socket.role)) => {
    const instance = {
      slots: [], pending: [], initialState, enabled: true, lateUpdates: 0,
      audio: { srcObject: null, play: async () => {}, plays: 0 },
      render() {
        rendering = this; this.index = 0;
        this.voice = useVoice(socket, this.enabled, this.initialState);
        this.voice.remoteAudioRef.current = this.audio;
        this.pending.splice(0).forEach((effect) => effect());
        return this.voice;
      },
      unmount() { this.slots.forEach((slot) => slot?.cleanup?.()); this.unmounted = true; },
    };
    instance.render();
    return instance;
  };
  const microphone = () => {
    const track = { kind: "audio", enabled: true, stops: 0, stop() { this.stops++; } };
    return { track, stream: new Stream([track]) };
  };
  return { mount, Socket, pcs, requests, intervals, timeouts, fetches, config, context, microphone };
}

for (const firstRole of ["p1", "p2"]) {
  test(`readiness recovers when ${firstRole} mounts first and its first signal is lost`, async () => {
    const env = environment();
    const first = new env.Socket(firstRole);
    const second = new env.Socket(firstRole === "p1" ? "p2" : "p1");
    first.peer = second; second.peer = first;
    const a = env.mount(first);
    await flush();
    assert.equal(env.intervals.size, 1);
    assert.equal(first.sent.filter((event) => event.data?.type === "desc").length, 0);
    for (const retry of [...env.intervals.values()]) retry();
    assert.equal(first.sent.filter((event) => event.data?.type === "ready").length, 2);
    const b = env.mount(second);
    await flush();
    for (const retry of [...env.intervals.values()]) retry();
    await flush();
    assert.equal(env.intervals.size, 0, "each peer must get its own readiness acknowledgement");
    assert.ok(env.pcs.every((pc) => pc.signalingState === "stable" && pc.remoteDescription));
    assert.equal(env.fetches[0].url, "https://voice.example/api/voice-config");
    assert.deepEqual(env.pcs[0].options.iceServers, env.config);
    a.unmount(); b.unmount();
    assert.ok(env.pcs.every((pc) => pc.connectionState === "closed"));
  });
}

test("streamless remote track plays, reports autoplay blocking, and unlocks on gesture", async () => {
  const env = environment();
  const app = env.mount(new env.Socket("p1"));
  await flush();
  app.audio.play = () => Promise.reject(new Error("NotAllowedError"));
  const remote = env.microphone().track;
  env.pcs[0].ontrack({ track: remote, streams: [] });
  await flush();
  assert.equal(app.audio.srcObject.getAudioTracks()[0], remote);
  assert.equal(app.render().playbackBlocked, true);
  assert.match(app.voice.error, /audio is blocked/);
  let called = false;
  app.audio.play = () => { called = true; return Promise.resolve(); };
  const unlock = app.voice.resumeAudio();
  assert.equal(called, true, "play must occur synchronously in the user gesture");
  await unlock;
  assert.equal(app.render().playbackBlocked, false);
  assert.equal(app.voice.error, null);
  app.unmount();
});

test("permission resolving after release or unmount never enables or leaks the microphone", async () => {
  for (const end of ["release", "unmount", "disconnect"]) {
    const env = environment();
    const socket = new env.Socket("p1");
    const app = env.mount(socket);
    await flush();
    env.pcs[0].connect();
    const pending = app.render().requestTalk();
    if (end === "release") app.voice.releaseTalk();
    if (end === "unmount") app.unmount();
    if (end === "disconnect") { socket.connected = false; socket.receive("disconnect"); }
    const { stream, track } = env.microphone();
    env.requests[0].resolve(stream);
    await pending;
    assert.equal(track.enabled, false);
    assert.equal(track.stops, 1);
    assert.equal(env.pcs[0].sender.track, null);
    assert.equal(socket.sent.some((event) => event.event === "voice_state" && event.talking), false);
    assert.equal(app.lateUpdates, 0);
    if (end !== "unmount") app.unmount();
  }
});

test("push-to-talk awaits replacement, and release during replacement mutes immediately", async () => {
  const env = environment();
  const socket = new env.Socket("p1");
  const app = env.mount(socket);
  await flush();
  const pc = env.pcs[0]; pc.connect();
  pc.replaceGate = deferred();
  const pending = app.render().requestTalk();
  const { stream, track } = env.microphone();
  env.requests[0].resolve(stream);
  await flush();
  assert.equal(track.enabled, false);
  assert.equal(app.render().talking, false);
  app.voice.releaseTalk();
  assert.equal(track.enabled, false);
  assert.ok(track.stops);
  pc.replaceGate.resolve();
  await pending; await flush();
  assert.equal(pc.sender.track, null);
  assert.equal(socket.sent.some((event) => event.event === "voice_state" && event.talking), false);
  app.unmount();
});

test("a held mic transmits only after attachment, then releases and cleans socket listeners", async () => {
  const env = environment();
  const socket = new env.Socket("p1");
  const app = env.mount(socket);
  await flush();
  const pc = env.pcs[0]; pc.connect();
  const pending = app.render().requestTalk();
  const { stream, track } = env.microphone();
  env.requests[0].resolve(stream);
  await pending;
  assert.equal(pc.sender.track, track);
  assert.equal(track.enabled, true);
  assert.equal(app.render().talking, true);
  socket.receive("voice_state", { from: "p2", talking: true });
  assert.equal(app.render().peerTalking, true);
  app.voice.releaseTalk();
  assert.equal(track.enabled, false);
  await flush();
  assert.equal(pc.sender.track, null);
  assert.equal(app.render().talking, false);
  app.unmount();
  assert.ok([...socket.listeners.values()].every((listeners) => listeners.size === 0));
  assert.equal(env.intervals.size, 0);
  assert.equal(app.audio.srcObject, null);
});

test("polite glare rolls back in order and drains queued ICE; impolite glare ignores offer ICE", async () => {
  for (const role of ["p1", "p2"]) {
    const env = environment();
    const socket = new env.Socket(role);
    const app = env.mount(socket);
    await flush();
    const pc = env.pcs[0];
    const signal = (data) => socket.receive("voice_signal", { from: role === "p1" ? "p2" : "p1", data });
    const candidate = { candidate: "candidate:1", usernameFragment: "theirs" };
    signal({ type: "ice", candidate });
    await flush();
    assert.equal(pc.candidates.length, 0);
    pc.signalingState = "have-local-offer";
    signal({ type: "desc", sdp: { type: "offer", sdp: "a=ice-ufrag:theirs\r\n" } });
    await flush();
    if (role === "p2") {
      assert.deepEqual(pc.events.slice(0, 2), [["local", "rollback"], ["remote", "offer"]]);
      assert.deepEqual(pc.candidates, [candidate]);
      assert.equal(pc.signalingState, "stable");
      assert.equal(socket.sent.at(-1).data.sdp.type, "answer");
    } else {
      signal({ type: "ice", candidate });
      await flush();
      assert.equal(pc.remoteDescription, undefined);
      assert.equal(pc.candidates.length, 0);
      signal({ type: "desc", sdp: { type: "answer", sdp: "a=ice-ufrag:accepted\r\n" } });
      await flush();
      signal({ type: "ice", candidate });
      signal({ type: "ice", candidate: { candidate: "candidate:2", usernameFragment: "accepted" } });
      await flush();
      assert.equal(pc.candidates.length, 1);
      assert.equal(pc.candidates[0].usernameFragment, "accepted");
    }
    assert.equal(app.render().error, null);
    app.unmount();
  }
});

test("socket disconnect closes resources and a new room state recreates voice", async () => {
  const env = environment();
  const socket = new env.Socket("p2");
  const app = env.mount(socket);
  await flush();
  const oldPc = env.pcs[0]; oldPc.connect();
  socket.connected = false;
  socket.receive("disconnect");
  assert.equal(oldPc.connectionState, "closed");
  assert.equal(env.intervals.size, 0);
  assert.equal(app.render().connected, false);
  socket.connected = true;
  socket.receive("state", state("p2"));
  await flush();
  assert.equal(env.pcs.length, 2);
  app.unmount();
});

test("late state props initialize voice, and disabling cancels pending config initialization", async () => {
  const env = environment();
  const config = deferred();
  env.context.fetch = () => config.promise;
  const app = env.mount(new env.Socket("p1"), null);
  assert.equal(env.timeouts.size, 0);
  app.initialState = state("p1"); app.render();
  assert.equal(env.timeouts.size, 1);
  app.enabled = false; app.render();
  config.resolve({ ok: false });
  await flush();
  assert.equal(env.pcs.length, 0);
  assert.equal(env.intervals.size, 0);
  app.unmount();
});
