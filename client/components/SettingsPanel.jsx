import React from "react";
import { IconSettings } from "./icons.jsx";
import { useSettings } from "../settings.js";

export default function SettingsPanel({ onClose }) {
  const [settings, updateSettings] = useSettings();

  return (
    <div className="settings-veil" role="presentation" onClick={onClose}>
      <aside className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(event) => event.stopPropagation()}>
        <div className="settings-head">
          <div>
            <div className="hero-kicker">SYSTEM / LOCAL</div>
            <h2 id="settings-title"><IconSettings size={15} /> SETTINGS</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close settings">×</button>
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
          <SettingToggle label="Mute all voice" detail="Silence every teammate and opponent" value={settings.muteAll} onChange={(value) => updateSettings({ muteAll: value })} />
          <SettingToggle label="Mute team voice" detail="Silence your teammates" value={settings.muteTeam} onChange={(value) => updateSettings({ muteTeam: value })} />
          <div className="settings-row settings-mode-row">
            <div><b>Default mic scope</b><span>Used when a team match starts</span></div>
            <div className="settings-segmented">
              <button className={settings.defaultVoiceScope === "team" ? "is-on" : ""} onClick={() => updateSettings({ defaultVoiceScope: "team" })}>TEAM</button>
              <button className={settings.defaultVoiceScope === "all" ? "is-on" : ""} onClick={() => updateSettings({ defaultVoiceScope: "all" })}>ALL</button>
            </div>
          </div>
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
