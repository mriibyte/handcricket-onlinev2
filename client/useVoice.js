import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_ICE = [{ urls: ["stun:stun.l.google.com:19302", "stun:global.stun.twilio.com:3478"] }];
const stopStream = (stream) => stream?.getTracks().forEach((track) => { track.enabled = false; track.stop(); });

/** Peer-to-peer, hold-to-talk audio. The room socket relays signaling only. */
export default function useVoice(socket, enabled, initialState = null) {
  const [connected, setConnected] = useState(false);
  const [talking, setTalking] = useState(false);
  const [peerTalking, setPeerTalking] = useState(false);
  const [error, setError] = useState(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const remoteAudioRef = useRef(null);
  const sessionRef = useRef(null);
  const stateRef = useRef(initialState);
  const applyStateRef = useRef(null);
  stateRef.current = initialState;

  const resumeAudio = useCallback(async () => {
    const session = sessionRef.current;
    const audio = remoteAudioRef.current;
    if (!session || !audio?.srcObject) return;
    try {
      // Call play before the first await, preserving the button's user activation.
      await audio.play();
      if (sessionRef.current !== session) return;
      setPlaybackBlocked(false);
    } catch {
      if (sessionRef.current === session) setPlaybackBlocked(true);
    }
  }, []);

  const releaseTalk = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    session.press++;
    session.wantTalk = false;
    stopStream(session.stream);
    session.stream = null;
    setTalking(false);
    if (socket?.connected) socket.emit("voice_state", { talking: false });
    // Serialize replacement with pending attachments; never remove the negotiated m-line.
    session.trackWork = session.trackWork.then(async () => {
      if (session.live && !session.wantTalk) await session.sender?.replaceTrack(null);
    }).catch(() => {});
  }, [socket]);

  const requestTalk = useCallback(async () => {
    void resumeAudio();
    const session = sessionRef.current;
    if (!session?.live || session.pc?.connectionState !== "connected" || session.wantTalk) return;
    session.wantTalk = true;
    const press = ++session.press;
    const current = () => session.live && sessionRef.current === session && session.wantTalk && session.press === press;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      // getUserMedia may resolve after release, disconnect, or unmount.
      stream.getAudioTracks().forEach((track) => { track.enabled = false; });
      if (!current()) { stopStream(stream); return; }
      const track = stream.getAudioTracks()[0];
      if (!track || !session.sender) throw new Error("No audio sender");
      session.stream = stream;
      const attach = session.trackWork.then(async () => {
        if (current()) await session.sender.replaceTrack(track);
      });
      session.trackWork = attach.catch(() => {});
      await attach;
      if (!current()) { stopStream(stream); return; }
      track.enabled = true;
      setTalking(true);
      setError(null);
      socket.emit("voice_state", { talking: true });
    } catch (err) {
      stopStream(stream);
      if (!current()) return;
      releaseTalk();
      setError(err?.name === "NotAllowedError" ? "Mic blocked — allow access and try again." : "Mic unavailable. Check your microphone and try again.");
    }
  }, [socket, releaseTalk, resumeAudio]);

  useEffect(() => {
    if (!socket || !enabled) return undefined;
    let disposed = false;
    let latestState = stateRef.current;

    const live = (session) => !disposed && session.live && sessionRef.current === session;
    const send = (session, data) => {
      if (live(session) && socket.connected) socket.emit("voice_signal", {
        data: { ...data, session: session.id, ...(session.peerId ? { target: session.peerId } : {}) },
      });
    };
    const teardown = (notify = true) => {
      const session = sessionRef.current;
      if (!session) return;
      if (notify && socket.connected) socket.emit("voice_state", { talking: false });
      session.live = false;
      session.wantTalk = false;
      session.press++;
      clearInterval(session.retry);
      session.abort.abort();
      stopStream(session.stream);
      session.stream = null;
      const pc = session.pc;
      if (pc) {
        pc.onicecandidate = pc.ontrack = pc.onconnectionstatechange = pc.onnegotiationneeded = null;
        pc.close();
      }
      session.ice = [];
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
      sessionRef.current = null;
      setConnected(false);
      setTalking(false);
      setPeerTalking(false);
      setPlaybackBlocked(false);
    };

    // SDP operations and incoming candidates share a queue, including rollback.
    const enqueue = (session, operation) => {
      session.signals = session.signals.then(async () => {
        await session.initialized;
        if (live(session)) await operation();
      }).catch(() => {
        if (live(session)) setError("Voice connection failed. Check your connection and try again.");
      });
    };
    const negotiate = (session) => enqueue(session, async () => {
      const pc = session.pc;
      if (!pc || !session.ready || pc.signalingState !== "stable") return;
      // Both peers receive readiness, but p1 initiates the first exchange.
      if (session.role === "p2" && !pc.remoteDescription) return;
      session.makingOffer = true;
      try {
        await pc.setLocalDescription(await pc.createOffer());
        send(session, { type: "desc", sdp: pc.localDescription });
      } finally {
        session.makingOffer = false;
      }
    });

    const start = (role) => {
      const session = {
        id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
        role, live: true, ready: false, press: 0, wantTalk: false,
        ice: [], signals: Promise.resolve(), trackWork: Promise.resolve(),
        abort: new AbortController(),
      };
      sessionRef.current = session;
      setError(null);
      session.initialized = (async () => {
        let iceServers = DEFAULT_ICE;
        // Optional TURN credentials are fetched per session, never baked into the client.
        const timeout = setTimeout(() => session.abort.abort(), 4000);
        try {
          const base = (import.meta.env.VITE_SERVER_URL || "").replace(/\/$/, "");
          const response = await fetch(`${base}/api/voice-config`, { signal: session.abort.signal });
          if (response.ok) {
            const config = await response.json();
            if (Array.isArray(config.iceServers) && config.iceServers.length) iceServers = config.iceServers;
          }
        } catch { /* STUN fallback when the optional endpoint is unavailable. */ }
        finally { clearTimeout(timeout); }
        if (!live(session)) return;
        const pc = new RTCPeerConnection({ iceServers });
        session.pc = pc;
        session.sender = pc.addTransceiver("audio", { direction: "sendrecv" }).sender;
        pc.onicecandidate = ({ candidate }) => {
          if (candidate) send(session, { type: "ice", candidate });
        };
        pc.onconnectionstatechange = () => {
          if (!live(session)) return;
          setConnected(pc.connectionState === "connected");
          if (pc.connectionState !== "connected") {
            releaseTalk();
            setPeerTalking(false);
          }
          if (pc.connectionState === "failed") setError("Voice could not connect. A TURN relay may be needed on this network.");
        };
        pc.ontrack = (event) => {
          if (!live(session)) return;
          // addTransceiver + replaceTrack usually emits an empty event.streams array.
          session.remoteStream = event.streams?.[0] || new MediaStream([event.track]);
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = session.remoteStream;
            void resumeAudio();
          }
        };
        pc.onnegotiationneeded = () => negotiate(session);
        const announce = () => send(session, { type: "ready" });
        // Do not rely on a room snapshot or a one-shot offer reaching a mounted peer.
        session.retry = setInterval(announce, 750);
        announce();
      })().catch(() => {
        if (live(session)) setError("Voice is not supported in this browser.");
      });
      return session;
    };

    const onState = (state) => {
      latestState = state;
      const role = state?.you?.role;
      if (!socket.connected || !state?.opponent?.connected || !["p1", "p2"].includes(role)) {
        teardown();
        return;
      }
      if (sessionRef.current?.role !== role) { teardown(); start(role); }
    };
    const onSignal = ({ from, data } = {}) => {
      let session = sessionRef.current;
      if (!session || !data || from === session.role || (data.target && data.target !== session.id)) return;
      if (data.type === "ready" && session.peerId && data.session && data.session !== session.peerId) {
        // A peer can remount without a room-state change. Retire the old connection.
        const role = session.role;
        teardown();
        session = start(role);
      }
      if (data.session && session.peerId && data.session !== session.peerId) return;
      enqueue(session, async () => {
        const pc = session.pc;
        if (!pc) return;
        if (data.type === "ready" || data.type === "ready-ack") {
          if (data.type === "ready-ack" && data.replyTo !== session.id) return;
          session.peerId = data.session;
          if (data.type === "ready") send(session, { type: "ready-ack", replyTo: data.session });
          else clearInterval(session.retry);
          if (!session.ready) { session.ready = true; negotiate(session); }
        } else if (data.type === "desc" && data.sdp) {
          const collision = data.sdp.type === "offer" && (session.makingOffer || pc.signalingState !== "stable");
          session.ignoreOffer = collision && session.role === "p1";
          if (session.ignoreOffer) { session.ice = []; return; }
          if (data.sdp.type === "answer" && pc.signalingState !== "have-local-offer") return;
          if (collision) await pc.setLocalDescription({ type: "rollback" });
          if (!live(session)) return;
          await pc.setRemoteDescription(data.sdp);
          const ufrags = [...(pc.remoteDescription.sdp || "").matchAll(/a=ice-ufrag:([^\r\n]+)/g)].map((match) => match[1]);
          for (const candidate of session.ice.splice(0)) {
            if (candidate.usernameFragment && ufrags.length && !ufrags.includes(candidate.usernameFragment)) continue;
            await pc.addIceCandidate(candidate);
          }
          if (data.sdp.type === "offer") {
            await pc.setLocalDescription(await pc.createAnswer());
            send(session, { type: "desc", sdp: pc.localDescription });
          }
        } else if (data.type === "ice" && data.candidate) {
          if (session.ignoreOffer) return;
          if (!pc.remoteDescription) session.ice.push(data.candidate);
          else {
            const ufrags = [...(pc.remoteDescription.sdp || "").matchAll(/a=ice-ufrag:([^\r\n]+)/g)].map((match) => match[1]);
            if (!data.candidate.usernameFragment || !ufrags.length || ufrags.includes(data.candidate.usernameFragment)) {
              await pc.addIceCandidate(data.candidate);
            }
          }
        } else if (data.type === "bye") teardown(false);
      });
    };
    const onVoiceState = ({ from, talking: value } = {}) => {
      if (sessionRef.current && from !== sessionRef.current.role) setPeerTalking(!!value);
    };
    const onDisconnect = () => teardown(false);
    const onConnect = () => onState(latestState);
    socket.on("state", onState);
    socket.on("voice_signal", onSignal);
    socket.on("voice_state", onVoiceState);
    socket.on("disconnect", onDisconnect);
    socket.on("connect", onConnect);
    applyStateRef.current = onState;
    onState(latestState);
    return () => {
      socket.off("state", onState);
      socket.off("voice_signal", onSignal);
      socket.off("voice_state", onVoiceState);
      socket.off("disconnect", onDisconnect);
      socket.off("connect", onConnect);
      applyStateRef.current = null;
      teardown();
      disposed = true;
    };
  }, [socket, enabled, releaseTalk, resumeAudio]);

  useEffect(() => {
    if (initialState) applyStateRef.current?.(initialState);
  }, [initialState]);

  return {
    connected, talking, peerTalking,
    error: playbackBlocked ? "Opponent audio is blocked — tap Enable audio or hold the mic to listen." : error,
    requestTalk, releaseTalk, remoteAudioRef, playbackBlocked, resumeAudio,
  };
}
