import React, { useState } from "react";
import { Logo, LogoMark } from "./Logo.jsx";
import { IconTrophy, IconLogout, IconLogin, IconSettings } from "./icons.jsx";
import { useSettings } from "../settings.js";

function Stat({ big, small }) {
  return (
    <div className="stat">
      <div className="stat-b">{big}</div>
      <div className="stat-s">{small}</div>
    </div>
  );
}

export default function HomePage({ user, stats, onEnter, onSignOut, onSignIn, onHistory }) {
  const signedIn = !!user?.id;
  const [settings, updateSettings] = useSettings();
  const [showSettings, setShowSettings] = useState(false);
  return (
    <div className="home">
      <header className="top">
        <Logo />
        <div className="home-actions">
          <button className="icon-btn ghosty" onClick={() => setShowSettings(true)} title="Settings" aria-label="Settings">
            <IconSettings />
          </button>
          {signedIn ? (
            <button className="icon-btn ghosty" onClick={onSignOut} title="Sign out" aria-label="Sign out">
              <IconLogout />
            </button>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={onSignIn}>
              <IconLogin /> Sign in
            </button>
          )}
        </div>
      </header>

      <section className="hero">
        <div className="hero-kicker">REAL-TIME · 2 PLAYERS · VS BOT</div>
        <h1 className="hero-title">
          SIX BALLS.
          <br />
          <span className="grad-text">PURE MIND GAMES.</span>
        </h1>
        <p className="hero-sub">
          The gully classic, rebuilt. Lock a secret number every ball — match your opponent and you're out, beat them and the
          batter's number scores. Track your record. Face the bot. Beat your friends.
        </p>
        <div className="hero-cta">
          <button className="btn btn-primary btn-lg" data-sound="confirm" onClick={onEnter}>
            Enter the arena
          </button>
          {signedIn && (
            <button className="btn btn-ghost btn-lg" onClick={onHistory}>
              Match history
            </button>
          )}
        </div>

        {signedIn && stats && (
          <div className="card home-stats">
            <div className="home-stats-head">
              <span className="avatar">{(user.name || user.username || "?").slice(0, 1).toUpperCase()}</span>
              <div>
                <div className="hs-name">{user.name}</div>
                <div className="hs-sub">@{user.username}</div>
              </div>
            </div>
            <div className="stat-row">
              <Stat big={stats.played} small="played" />
              <Stat big={stats.wins} small="wins" />
              <Stat big={stats.losses} small="losses" />
              <Stat big={stats.ties} small="ties" />
              <Stat big={stats.best} small="best" />
            </div>
            <div className="winrate">
              <div className="winrate-bar">
                <i style={{ width: `${stats.winRate}%` }} />
              </div>
              <span>{stats.winRate}% win rate</span>
            </div>
          </div>
        )}
      </section>

      <section className="steps">
        <div className="step">
          <div className="step-num">01</div>
          <div>
            <b>Call the toss</b>
            <span>Even or odd — a secret number each decides it.</span>
          </div>
        </div>
        <div className="step">
          <div className="step-num">02</div>
          <div>
            <b>Same number = OUT</b>
            <span>Otherwise the batter's pick scores runs.</span>
          </div>
        </div>
        <div className="step">
          <div className="step-num">03</div>
          <div>
            <b>Chase or defend</b>
            <span>Highest total after two innings takes it.</span>
          </div>
        </div>
      </section>

      <footer className="home-foot">HAND CRICKET ARENA · <span>EST. 2026</span></footer>

      {showSettings && (
        <div className="settings-veil" role="presentation" onClick={() => setShowSettings(false)}>
          <aside className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(event) => event.stopPropagation()}>
            <div className="settings-head">
              <div>
                <div className="hero-kicker">SYSTEM / LOCAL</div>
                <h2 id="settings-title">SETTINGS</h2>
              </div>
              <button className="icon-btn" onClick={() => setShowSettings(false)} aria-label="Close settings">×</button>
            </div>

            <div className="settings-group">
              <div className="settings-label">INTERFACE</div>
              <SettingToggle label="Sound effects" detail="Small tones for taps and navigation" value={settings.sounds} onChange={(value) => updateSettings({ sounds: value })} />
              <SettingToggle label="Reduced motion" detail="Keep transitions quiet" value={settings.reducedMotion} onChange={(value) => updateSettings({ reducedMotion: value })} />
            </div>

            <div className="settings-group">
              <div className="settings-label">VOICE CHAT</div>
              <SettingToggle label="Voice chat" detail="Enable multiplayer voice" value={settings.voiceEnabled} onChange={(value) => updateSettings({ voiceEnabled: value })} />
              <SettingToggle label="Mute opponent" detail="You can still speak; their audio stays silent" value={settings.muteOpponent} onChange={(value) => updateSettings({ muteOpponent: value })} />
              <div className="settings-row settings-mode-row">
                <div><b>Mic mode</b><span>How your microphone activates</span></div>
                <div className="settings-segmented">
                  <button className={settings.voiceMode === "push-to-talk" ? "is-on" : ""} onClick={() => updateSettings({ voiceMode: "push-to-talk" })}>HOLD</button>
                  <button className={settings.voiceMode === "persistent" ? "is-on" : ""} onClick={() => updateSettings({ voiceMode: "persistent" })}>OPEN</button>
                </div>
              </div>
            </div>
            <p className="settings-note">Settings are saved on this device.</p>
          </aside>
        </div>
      )}
    </div>
  );
}

function SettingToggle({ label, detail, value, onChange }) {
  return (
    <div className="settings-row">
      <div><b>{label}</b><span>{detail}</span></div>
      <button className={`settings-switch ${value ? "is-on" : ""}`} onClick={() => onChange(!value)} aria-pressed={value}>
        <span>{value ? "ON" : "OFF"}</span>
      </button>
    </div>
  );
}
