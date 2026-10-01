import React, { useEffect, useRef, useState } from "react";
import { IconBack, IconMic, IconMicOff, IconSettings, IconUsers } from "./icons.jsx";
import { useSettings, saveSettings } from "../settings.js";
import useTeamVoice from "../useTeamVoice.js";
import SettingsPanel from "./SettingsPanel.jsx";

const nums = (count) => Array.from({ length: count }, (_, index) => index + 1);

export default function TeamMatch({ state, socket, onLeave, onStatsRefresh }) {
  const [settings] = useSettings();
  const [showSettings, setShowSettings] = useState(false);
  const [localPick, setLocalPick] = useState(null);
  const [rosterOpen, setRosterOpen] = useState(false);
  const everyone = state.teams.flatMap((team) => team.players);
  const voice = useTeamVoice(socket, settings.voiceEnabled, {
    participants: everyone,
    selfId: state.you?.playerId,
    selfTeamId: state.you?.teamId,
    initialScope: settings.defaultVoiceScope,
  });
  const persistent = settings.voiceMode === "persistent";
  const current = state.current;
  const isTeamMuted = (player) => settings.muteAll || (settings.muteOpponent && player.teamId !== state.you?.teamId) || (settings.muteTeam && player.teamId === state.you?.teamId) || !!settings.mutedPeers?.[player.playerId];
  const emit = (event, data = {}) => socket.emit("team_action", { event, data });

  useEffect(() => {
    if (state.phase === "result") onStatsRefresh?.();
    setLocalPick(null);
  }, [state.phase, state.lastEventSeq]);

  const togglePeerMute = (playerId) => {
    const mutedPeers = { ...(settings.mutedPeers || {}) };
    if (mutedPeers[playerId]) delete mutedPeers[playerId]; else mutedPeers[playerId] = true;
    saveSettings({ mutedPeers });
  };

  const stage = (() => {
    if (state.phase === "toss_call") return state.you?.isCaptain && state.you.teamId === "A" ? (
      <><Kicker>TOSS / TEAM A</Kicker><h2 className="stage-title">Call it in the air.</h2><p className="stage-sub">Your captain chooses even or odd.</p><div className="choice-row"><button className="choice-card" onClick={() => emit("toss_call", { call: "e" })}><b>EVEN</b><span className="mono">2 · 4 · 6 · 8 · 10</span></button><button className="choice-card" onClick={() => emit("toss_call", { call: "o" })}><b>ODD</b><span className="mono">1 · 3 · 5 · 7 · 9</span></button></div></>
    ) : <><Kicker>THE TOSS</Kicker><h2 className="stage-title">Team A is calling it…</h2><Wait /></>;
    if (state.phase === "toss_number") return (
      <><Kicker>TOSS · {state.toss.call === "e" ? "EVEN" : "ODD"}</Kicker><h2 className="stage-title">Lock your team number.</h2><p className="stage-sub">Only the team captain submits the number.</p><NumberPad count={10} disabled={!state.toss.youCanSubmit} picked={localPick} onPick={(number) => { setLocalPick(number); emit("toss_number", { num: number }); }} />{!state.toss.youCanSubmit && <Wait text="Waiting for both captains…" />}</>
    );
    if (state.phase === "bat_bowl_choice") return state.you?.isCaptain && state.toss.winnerTeamId === state.you.teamId ? (
      <><Kicker>YOUR TEAM WON THE TOSS</Kicker><h2 className="stage-title">Bat or bowl first?</h2><div className="choice-row"><button className="choice-card" onClick={() => emit("bat_bowl_choice", { choice: "bat" })}><b>BAT FIRST</b><span>Set the target</span></button><button className="choice-card" onClick={() => emit("bat_bowl_choice", { choice: "bowl" })}><b>BOWL FIRST</b><span>Chase it down</span></button></div></>
    ) : <><Kicker>TOSS DECIDED</Kicker><h2 className="stage-title">The winning captain is choosing…</h2><Wait /></>;
    if (state.phase === "innings") return (
      <><Kicker>INNINGS {state.inningsNo} · OVER {current.over + 1}</Kicker><h2 className="stage-title">{current.youCanPick ? (current.activeBatter?.isYou ? "Your bat in hand." : "Your delivery.") : `${current.activeBatter?.name || "Batter"} vs ${current.activeBowler?.name || "Bowler"}`}</h2><p className="stage-sub">{current.activeBatter?.name} batting · {current.activeBowler?.name} bowling. The over rotates the bowler.</p>{current.youCanPick ? <NumberPad count={6} disabled={current.youPicked} picked={localPick} onPick={(number) => { setLocalPick(number); emit("ball_pick", { num: number }); }} /> : <Wait text="Active players are choosing…" />}{current.youCanPick && current.youPicked && <Wait text="Locked — waiting for the other side…" />}</>
    );
    if (state.phase === "innings_break") return <><Kicker>INNINGS BREAK</Kicker><h2 className="stage-title">Target: {state.firstInningsSummary.runs + 1}</h2><div className="break-nums"><div><span>Team {state.firstInningsSummary.teamId}</span><b className="mono">{state.firstInningsSummary.runs}</b></div><div className="break-arrow">→</div><div><span>Target</span><b className="mono gold-text">{state.firstInningsSummary.runs + 1}</b></div></div><button className="btn btn-primary btn-block" onClick={() => emit("start_second_innings")}>Start innings 2</button></>;
    if (state.phase === "result") return <><div className={`result-badge ${state.result.winnerTeamId === state.you?.teamId ? "win" : state.result.winnerTeamId ? "lose" : "tie"}`}>{state.result.winnerTeamId ? `TEAM ${state.result.winnerTeamId} WINS` : "A TIE"}</div><div className="result-nums"><div><span>Team A</span><b className="mono">{state.result.scores.A}</b></div><div className="break-arrow">vs</div><div><span>Team B</span><b className="mono">{state.result.scores.B}</b></div></div><button className="btn btn-primary btn-block" onClick={() => emit("rematch")}>Play again</button></>;
    return <Wait />;
  })();

  return (
    <div className="team-match">
      <header className="match-top">
        <button className="icon-btn ghosty" onClick={onLeave} title="Leave match"><IconBack /></button>
        <div className="names"><span className="n-you is-live">Team {state.you?.teamId}</span><em>vs</em><span>Team {state.you?.teamId === "A" ? "B" : "A"}</span></div>
        <div className="match-top-right"><button className="icon-btn ghosty" onClick={() => setRosterOpen((open) => !open)} title="Voice roster"><IconUsers /></button><button className="icon-btn ghosty" onClick={() => setShowSettings(true)} title="Settings"><IconSettings /></button><span className="chip mono">{state.code}</span></div>
      </header>
      <div className="scorebar"><div><div className="score-runs">{current?.runs || 0}<span className="score-wkts">/{state.wickets - (current?.wicketsLeft ?? state.wickets)}</span></div><div className="score-overs mono">{current ? `${Math.floor(current.ballsPlayed / 6)}.${current.ballsPlayed % 6}` : "0.0"} · {state.overs} OV</div></div><div className="score-side"><div className="role-tag is-bat">TEAM {current?.battingTeamId || "—"}</div>{state.target !== null && <div className="target-tag mono">TARGET {state.target + 1}</div>}</div></div>
      <div className="team-voice-bar card">
        <div className="voice-scope"><span className="settings-label">MIC SCOPE</span><div className="settings-segmented"><button className={voice.scope === "team" ? "is-on" : ""} onClick={() => voice.setScope("team")}>TEAM</button><button className={voice.scope === "all" ? "is-on" : ""} onClick={() => voice.setScope("all")}>ALL</button></div></div>
        <button className={`btn ${voice.talking ? "btn-primary" : "btn-ghost"} voice-main-button`} onPointerDown={!persistent ? voice.request : undefined} onPointerUp={!persistent ? voice.release : undefined} onPointerCancel={!persistent ? voice.release : undefined} onClick={persistent ? voice.request : undefined}>{voice.talking ? <IconMic /> : <IconMicOff />} {persistent ? (voice.talking ? "Mute mic" : "Open mic") : "Hold to talk"}</button>
      </div>
      {rosterOpen && <div className="card voice-roster"><div className="settings-label">VOICE ROSTER</div>{everyone.filter((player) => player.playerId !== state.you?.playerId).map((player) => <div className="voice-person" key={player.playerId}><span className={`presence-dot ${voice.connectedById[player.playerId] ? "is-online" : ""}`} /><span><b>{player.name}</b><small>TEAM {player.teamId} {voice.talkingById[player.playerId] ? "· TALKING" : ""}</small></span><button className="btn btn-ghost btn-sm" onClick={() => togglePeerMute(player.playerId)}>{isTeamMuted(player) ? "Unmute" : "Mute"}</button><audio autoPlay playsInline muted={isTeamMuted(player)} ref={(node) => { if (node && voice.streamsById[player.playerId]) node.srcObject = voice.streamsById[player.playerId]; }} /></div>)}</div>}
      <div className="stage card">{stage}</div>
      {voice.error && <div className="voice-error team-voice-error">{voice.error}</div>}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function NumberPad({ count, disabled, picked, onPick }) { return <div className={`pad pad-${count}`}>{nums(count).map((number) => <button key={number} className={`num ${picked === number ? "is-picked" : ""}`} disabled={disabled} onClick={() => onPick(number)}>{number}</button>)}</div>; }
const Kicker = ({ children }) => <div className="stage-kicker">{children}</div>;
const Wait = ({ text = "Waiting…" }) => <div className="wait-badge"><span className="spinner" />{text}</div>;
