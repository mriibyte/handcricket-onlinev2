import React, { useState } from "react";
import { api } from "../api.js";
import { Logo } from "./Logo.jsx";
import { IconLogin, IconShield } from "./icons.jsx";

export default function AuthPage({ onAuthed, onGuest }) {
  const [tab, setTab] = useState("login"); // login | signup
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const path = tab === "login" ? "/login" : "/signup";
      const d = await api(path, { method: "POST", body: { username, password, name } });
      onAuthed(d);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-brand">
        <Logo big />
        <p className="auth-tag">One hand. Six numbers. Nerves of steel.</p>
      </div>

      <form className="card auth-card" onSubmit={submit}>
        <div className="auth-tabs">
          <button type="button" className={`tab ${tab === "login" ? "is-on" : ""}`} onClick={() => { setTab("login"); setError(""); }}>
            Sign in
          </button>
          <button type="button" className={`tab ${tab === "signup" ? "is-on" : ""}`} onClick={() => { setTab("signup"); setError(""); }}>
            Create account
          </button>
        </div>

        <div className="field">
          <div className="field-label">Username</div>
          <input
            className="input mono"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. six_machine"
            autoComplete="username"
            autoCapitalize="none"
            maxLength={16}
            required
          />
        </div>

        {tab === "signup" && (
          <div className="field">
            <div className="field-label">Display name <span className="opt">(optional)</span></div>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rohan"
              maxLength={20}
            />
          </div>
        )}

        <div className="field">
          <div className="field-label">Password</div>
          <input
            className="input mono"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={tab === "signup" ? "4+ characters" : "••••••••"}
            autoComplete={tab === "signup" ? "new-password" : "current-password"}
            required
          />
        </div>

        {error && <div className="error shake">{error}</div>}

        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "…" : tab === "login" ? (<>Sign in <IconLogin /></>) : (<>Create account <IconShield /></>)}
        </button>
      </form>

      <button className="guest-link" onClick={onGuest}>
        Skip — play as guest
      </button>

      <p className="auth-foot">Accounts are stored in SQLite on the server. Wins, losses &amp; best score are tracked.</p>
    </div>
  );
}
