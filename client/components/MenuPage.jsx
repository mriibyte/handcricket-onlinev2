import React, { useState } from "react";
import { socket } from "../socket.js";
import { getToken } from "../api.js";
import { Stepper, Segmented } from "./ui.jsx";
import { IconBack, IconBot, IconUsers, IconCoin } from "./icons.jsx";

export default function MenuPage({ user, stats, onBack }) {
  const [mode, setMode] = useState(null); // 'bot' | 'create' | 'join'
  const [name, setName] = useState(user?.name || "");
  const [difficulty, setDifficulty] = useState("medium");
  const [overs, setOvers] = useState(2);
  const [wickets, setWickets] = useState(2);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const displayName = () => name.trim() || "Player";

  const startBot = () => {
    setError("");
    setBusy(true);
    socket.emit(
      "create_room",
      { name: displayName(), overs, wickets, difficulty, token: getToken() },
      (res) => {
        setBusy(false);
        if (!res.ok) setError(res.error || "Could not start the match.");
      }
    );
  };

  const createRoom = () => {
    setError("");
    setBusy(true);
    socket.emit("create_room", { name: displayName(), overs, wickets, token: getToken() }, (res) => {
      setBusy(false);
      if (!res.ok) setError(res.error || "Could not create the room.");
    });
  };

  const joinRoom = () => {
    setError("");
    const c = code.trim().toUpperCase();
    if (c.length !== 5) return setError("Room codes are 5 characters.");
    setBusy(true);
    socket.emit("join_room", { name: displayName(), code: c }, (res) => {
      setBusy(false);
      if (!res.ok) setError(res.error || "Could not join that room.");
    });
  };

  return (
    <div className="menu">
      <header className="top">
        <button className="icon-btn ghosty" onClick={onBack}>
          <IconBack />
        </button>
        <div className="page-title">Choose your battle</div>
        <span className="chip">{user?.id ? `@${user.username}` : "guest"}</span>
      </header>

      <div className="mode-grid">
        <button className={`mode-card ${mode === "bot" ? "is-active" : ""}`} onClick={() => setMode(mode === "bot" ? null : "bot")}>
          <span className="mode-icon gold"><IconBot /></span>
          <span className="mode-body">
            <span className="mode-title">Play vs Bot</span>
            <span className="mode-desc">Singleplayer · three difficulty tiers</span>
          </span>
        </button>

        <button className={`mode-card ${mode === "create" ? "is-active" : ""}`} onClick={() => setMode(mode === "create" ? null : "create")}>
          <span className="mode-icon teal"><IconUsers /></span>
          <span className="mode-body">
            <span className="mode-title">Create a room</span>
            <span className="mode-desc">Multiplayer · share the code with a friend</span>
          </span>
        </button>

        <button className={`mode-card ${mode === "join" ? "is-active" : ""}`} onClick={() => setMode(mode === "join" ? null : "join")}>
          <span className="mode-icon violet"><IconCoin /></span>
          <span className="mode-body">
            <span className="mode-title">Join a room</span>
            <span className="mode-desc">Multiplayer · you have a code</span>
          </span>
        </button>
      </div>

      {mode && (
        <div className="card config-panel fade-up" key={mode}>
          {mode === "bot" && (
            <>
              <div className="config-title">Face the bot</div>
              <Segmented
                value={difficulty}
                onChange={setDifficulty}
                options={[
                  { value: "easy", label: "Rookie", hint: "plays loose" },
                  { value: "medium", label: "Pro", hint: "balanced" },
                  { value: "hard", label: "Ruthless", hint: "reads you" },
                ]}
              />
              <div className="field">
                <div className="field-label">Your name</div>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="e.g. Rohan" />
              </div>
              <div className="row">
                <Stepper label="Overs" value={overs} onChange={setOvers} min={1} max={20} />
                <Stepper label="Wickets" value={wickets} onChange={setWickets} min={1} max={10} />
              </div>
              <button className="btn btn-primary btn-block" onClick={startBot} disabled={busy}>
                Start match
              </button>
            </>
          )}

          {mode === "create" && (
            <>
              <div className="config-title">Host a room</div>
              <div className="field">
                <div className="field-label">Your name</div>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="e.g. Rohan" />
              </div>
              <div className="row">
                <Stepper label="Overs" value={overs} onChange={setOvers} min={1} max={20} />
                <Stepper label="Wickets" value={wickets} onChange={setWickets} min={1} max={10} />
              </div>
              <button className="btn btn-primary btn-block" onClick={createRoom} disabled={busy}>
                Create room
              </button>
            </>
          )}

          {mode === "join" && (
            <>
              <div className="config-title">Join with a code</div>
              <div className="field">
                <div className="field-label">Your name</div>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="e.g. Priya" />
              </div>
              <div className="field">
                <div className="field-label">Room code</div>
                <input
                  className="input code mono"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))}
                  placeholder="ABCDE"
                  maxLength={5}
                  onKeyDown={(e) => e.key === "Enter" && joinRoom()}
                />
              </div>
              <button className="btn btn-primary btn-block" onClick={joinRoom} disabled={busy}>
                Join room
              </button>
            </>
          )}

          {error && <div className="error shake">{error}</div>}
        </div>
      )}

      <p className="menu-foot">Same number as the batter = OUT. Everything else scores.</p>
    </div>
  );
}
