import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Push-to-talk voice for multiplayer matches, peer-to-peer over WebRTC.
 * The server only relays SDP/ICE handshakes — audio never touches it.
 *
 * Usage: `const voice = useVoice(socket, enabled)` where `enabled` is false
 * for bot matches. Hold the PTT button (`voice.requestTalk()` …
 * `voice.releaseTalk()`) to transmit; `voice.peerTalking` mirrors the
 * opponent's mic state for the UI.
 */
export default function useVoice(socket, enabled) {
  const [connected, setConnected] = useState(false);
  const [peerTalking, setPeerTalking] = useState(false);
  const [talking, setTalking] = useState(false);
  const [error, setError] = useState(null);

  const pcRef = useRef(null);
  const channelRef = useRef(null);
  const streamRef = useRef(null);
  const wantTalkRef = useRef(false); // true while the PTT button is held
  const grantedRef = useRef(false); // true once the mic was actually unlocked
  const politeRef = useRef(false); // glare resolution: p1 is impolite, p2 polite
  const makingOfferRef = useRef(false);
  const myRoleRef = useRef(null);
  const enabledRef = useRef(false);
  enabledRef.current = !!enabled;

  const teardown = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.onconnectionstatechange = null;
      try {
        pcRef.current.close();
      } catch {
        /* already closed */
      }
      pcRef.current = null;
    }
    channelRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        t.stop();
        streamRef.current.removeTrack(t);
      });
      streamRef.current = null;
    }
    grantedRef.current = false;
    if (wantTalkRef.current) {
      wantTalkRef.current = false;
      setTalking(false);
      socket.emit("voice_state", { talking: false });
    }
    setConnected(false);
    setPeerTalking(false);
  }, [socket]);

  const send = useCallback((data) => socket.emit("voice_signal", { data }), [socket]);

  const grantMic = useCallback(async () => {
    if (grantedRef.current) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    streamRef.current = stream;
    stream.getAudioTracks().forEach((t) => {
      try {
        pcRef.current.addTrack(t, stream);
      } catch {
        t.stop(); // peer connection died mid-flight — don't leave the light on
      }
    });
    grantedRef.current = true;
  }, []);

  const trySendOffer = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || makingOfferRef.current) return;
    makingOfferRef.current = true;
    try {
      await pc.setLocalDescription(await pc.createOffer());
      if (pc.localDescription) send({ type: "desc", sdp: pc.localDescription });
    } catch {
      /* the other side will offer if we glitched */
    } finally {
      makingOfferRef.current = false;
    }
  }, [send]);

  // wire a fresh peer connection once both roles are known
  const ensurePc = useCallback(() => {
    if (pcRef.current || !myRoleRef.current) return;
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:global.stun.twilio.com:3478"] }],
    });
    pcRef.current = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate) send({ type: "ice", candidate: e.candidate });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setConnected(true);
      else if (["failed", "closed"].includes(pc.connectionState)) setConnected(false);
    };
    // control channel: 1 = peer started talking, 0 = stopped
    pc.ondatachannel = (e) => {
      const ch = e.channel;
      channelRef.current = ch;
      ch.onmessage = (ev) => setPeerTalking(ev.data === 1);
      ch.onclose = () => setPeerTalking(false);
    };

    if (myRoleRef.current === "p1") trySendOffer(); // p1 offers; p2 answers
  }, [send, trySendOffer]);

  const handleSignal = useCallback(
    async ({ from, data }) => {
      if (!enabledRef.current || from === myRoleRef.current) return;
      const pc = pcRef.current;
      if (!pc) return;
      try {
        if (data.type === "desc") {
          const offerCollision = data.sdp.type === "offer" && (makingOfferRef.current || pc.signalingState !== "stable");
          // perfect negotiation: the impolite peer (p1) wins collisions
          if (offerCollision && !politeRef.current) return;
          if (offerCollision) {
            await Promise.all([
              pc.setLocalDescription({ type: "rollback" }).catch(() => {}),
              pc.setRemoteDescription(data.sdp),
            ]);
          } else {
            await pc.setRemoteDescription(data.sdp);
          }
          if (data.sdp.type === "offer") {
            await pc.setLocalDescription(await pc.createAnswer());
            if (pc.localDescription) send({ type: "desc", sdp: pc.localDescription });
          }
        } else if (data.type === "ice" && data.candidate) {
          try {
            await pc.addIceCandidate(data.candidate);
          } catch {
            /* candidate for a closed connection */
          }
        } else if (data.type === "bye") {
          teardown();
        }
      } catch (err) {
        console.warn("voice signal error", err);
      }
    },
    [send, teardown]
  );

  // (re)initialize on match start / peer change / enable toggle
  useEffect(() => {
    if (!socket) return undefined;

    const onState = (s) => {
      if (!enabledRef.current || !s?.opponent?.connected) {
        if (pcRef.current) teardown();
        myRoleRef.current = null;
        return;
      }
      const role = s.you?.role;
      const oppConnected = !!s.opponent?.connected;
      if (role && oppConnected && (!myRoleRef.current || pcRef.current === null)) {
        myRoleRef.current = role;
        politeRef.current = role === "p2";
        ensurePc();
      }
    };

    const onVoiceSignal = (payload) => {
      handleSignal(payload);
    };
    const onVoiceState = ({ from, talking: t }) => {
      if (from !== myRoleRef.current) setPeerTalking(!!t);
    };
    const onDisconnect = () => teardown();

    socket.on("state", onState);
    socket.on("voice_signal", onVoiceSignal);
    socket.on("voice_state", onVoiceState);
    socket.io.on("disconnect", onDisconnect);
    return () => {
      socket.off("state", onState);
      socket.off("voice_signal", onVoiceSignal);
      socket.off("voice_state", onVoiceState);
      socket.io.off("disconnect", onDisconnect);
    };
  }, [socket, ensurePc, handleSignal, teardown]);

  // full reset when the match (or voice support) goes away
  useEffect(() => {
    if (!enabled) teardown();
  }, [enabled, teardown]);

  const releaseTalk = useCallback(() => {
    wantTalkRef.current = false;
    setTalking(false);
    if (channelRef.current && channelRef.current.readyState === "open") {
      try {
        channelRef.current.send(0);
      } catch {
        /* channel closing */
      }
    }
    socket.emit("voice_state", { talking: false });
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = false;
        try {
          pcRef.current.removeTrack(t.sender);
        } catch {
          /* pc closing */
        }
        t.stop();
      });
      streamRef.current = null;
    }
    grantedRef.current = false;
  }, [socket]);

  const requestTalk = useCallback(async () => {
    if (!connected || wantTalkRef.current) return;
    wantTalkRef.current = true;
    try {
      await grantMic();
      if (!wantTalkRef.current) {
        // released while the permission prompt was up
        releaseTalk();
        return;
      }
      streamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = true;
      });
      setTalking(true);
      if (channelRef.current && channelRef.current.readyState === "open") {
        try {
          channelRef.current.send(1);
        } catch {
          /* channel closing */
        }
      }
      socket.emit("voice_state", { talking: true });
      setError(null);
    } catch (e) {
      wantTalkRef.current = false;
      setTalking(false);
      setError(e?.name === "NotAllowedError" ? "Mic blocked — allow access and try again." : "Mic unavailable.");
    }
  }, [connected, grantMic, releaseTalk, socket]);

  return { connected, talking, peerTalking, error, requestTalk, releaseTalk };
}
