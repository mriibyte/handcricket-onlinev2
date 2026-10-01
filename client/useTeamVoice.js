import { useCallback, useEffect, useRef, useState } from "react";

const defaultIce = [{ urls: ["stun:stun.l.google.com:19302", "stun:global.stun.twilio.com:3478"] }];

export default function useTeamVoice(socket, enabled, { participants = [], selfId, selfTeamId, initialScope = "all" } = {}) {
  const sessions = useRef(new Map());
  const streamRef = useRef(null);
  const [talking, setTalking] = useState(false);
  const [scope, setScope] = useState(initialScope);
  const [talkingById, setTalkingById] = useState({});
  const [connectedById, setConnectedById] = useState({});
  const [streamsById, setStreamsById] = useState({});
  const [error, setError] = useState(null);
  const participantMap = useRef(new Map());
  participants.forEach((p) => participantMap.current.set(p.playerId, p));

  const eligible = useCallback((peerId) => {
    const peer = participantMap.current.get(peerId);
    return scope === "all" || peer?.teamId === selfTeamId;
  }, [scope, selfTeamId]);

  const send = useCallback((peerId, data) => {
    if (socket?.connected) socket.emit("voice_signal", { data: { ...data, to: peerId } });
  }, [socket]);

  const applyLocalTrack = useCallback(async () => {
    for (const [peerId, session] of sessions.current) {
      if (!session.sender) continue;
      await session.sender.replaceTrack(eligible(peerId) ? streamRef.current?.getAudioTracks?.()[0] || null : null).catch(() => {});
    }
  }, [eligible]);

  const createSession = useCallback(async (peerId) => {
    if (!peerId || peerId === selfId || sessions.current.has(peerId)) return;
    const session = { peerId, pc: null, sender: null, candidates: [], queue: Promise.resolve(), makingOffer: false };
    sessions.current.set(peerId, session);
    try {
      let iceServers = defaultIce;
      const base = (import.meta.env.VITE_SERVER_URL || "").replace(/\/$/, "");
      const response = await fetch(`${base}/api/voice-config`);
      if (response.ok) iceServers = (await response.json()).iceServers || defaultIce;
      const pc = new RTCPeerConnection({ iceServers });
      session.pc = pc;
      session.sender = pc.addTransceiver("audio", { direction: "sendrecv" }).sender;
      pc.onicecandidate = ({ candidate }) => candidate && send(peerId, { type: "ice", candidate });
      pc.onconnectionstatechange = () => setConnectedById((prev) => ({ ...prev, [peerId]: pc.connectionState === "connected" }));
      pc.ontrack = (event) => {
        const stream = event.streams?.[0] || new MediaStream([event.track]);
        setStreamsById((prev) => ({ ...prev, [peerId]: stream }));
      };
      pc.onnegotiationneeded = () => {
        if (String(selfId) > String(peerId) || session.makingOffer || pc.signalingState !== "stable") return;
        session.queue = session.queue.then(async () => {
          session.makingOffer = true;
          try { await pc.setLocalDescription(await pc.createOffer()); send(peerId, { type: "desc", sdp: pc.localDescription }); }
          finally { session.makingOffer = false; }
        }).catch(() => {});
      };
      await applyLocalTrack();
      if (String(selfId) < String(peerId)) {
        session.queue = session.queue.then(async () => {
          session.makingOffer = true;
          try { await pc.setLocalDescription(await pc.createOffer()); send(peerId, { type: "desc", sdp: pc.localDescription }); }
          finally { session.makingOffer = false; }
        }).catch(() => {});
      }
    } catch {
      sessions.current.delete(peerId);
      setError("Team voice is unavailable on this network.");
    }
  }, [applyLocalTrack, selfId, send]);

  useEffect(() => {
    if (!enabled || !socket || !selfId) return undefined;
    const peers = participants.filter((p) => p.playerId !== selfId && p.connected);
    peers.forEach((peer) => createSession(peer.playerId));
    for (const [peerId, session] of sessions.current) {
      if (!peers.some((peer) => peer.playerId === peerId)) {
        session.pc?.close();
        sessions.current.delete(peerId);
        setConnectedById((prev) => { const next = { ...prev }; delete next[peerId]; return next; });
        setStreamsById((prev) => { const next = { ...prev }; delete next[peerId]; return next; });
      }
    }
    return undefined;
  }, [createSession, enabled, participants, selfId, socket]);

  useEffect(() => {
    if (!enabled || !socket) return undefined;
    const onSignal = ({ from, data } = {}) => {
      const session = sessions.current.get(from);
      if (!session || !data || !session.pc) return;
      session.queue = session.queue.then(async () => {
        const pc = session.pc;
        if (data.type === "ice") {
          if (!pc.remoteDescription) session.candidates.push(data.candidate);
          else await pc.addIceCandidate(data.candidate).catch(() => {});
          return;
        }
        if (data.type !== "desc" || !data.sdp) return;
        const collision = data.sdp.type === "offer" && (session.makingOffer || pc.signalingState !== "stable");
        if (collision && String(selfId) < String(from)) return;
        if (collision) await pc.setLocalDescription({ type: "rollback" }).catch(() => {});
        await pc.setRemoteDescription(data.sdp);
        for (const candidate of session.candidates.splice(0)) await pc.addIceCandidate(candidate).catch(() => {});
        if (data.sdp.type === "offer") {
          await pc.setLocalDescription(await pc.createAnswer());
          send(from, { type: "desc", sdp: pc.localDescription });
        }
      }).catch(() => {});
    };
    const onVoiceState = ({ from, talking: value }) => setTalkingById((prev) => ({ ...prev, [from]: !!value }));
    socket.on("voice_signal", onSignal);
    socket.on("voice_state", onVoiceState);
    return () => { socket.off("voice_signal", onSignal); socket.off("voice_state", onVoiceState); };
  }, [enabled, selfId, send, socket]);

  useEffect(() => { applyLocalTrack(); }, [applyLocalTrack, scope]);

  const release = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setTalking(false);
    socket?.emit("voice_state", { talking: false, scope });
    applyLocalTrack();
  }, [applyLocalTrack, scope, socket]);

  const request = useCallback(async () => {
    if (talking) return release();
    try {
      streamRef.current ||= await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      await applyLocalTrack();
      streamRef.current.getAudioTracks().forEach((track) => { track.enabled = true; });
      setTalking(true);
      socket?.emit("voice_state", { talking: true, scope });
    } catch (err) {
      setError(err?.name === "NotAllowedError" ? "Microphone permission was denied." : "Microphone unavailable.");
    }
  }, [applyLocalTrack, release, scope, socket, talking]);

  useEffect(() => () => {
    release();
    for (const session of sessions.current.values()) session.pc?.close();
    sessions.current.clear();
  }, [release]);

  return { request, release, talking, scope, setScope, talkingById, connectedById, streamsById, error };
}
