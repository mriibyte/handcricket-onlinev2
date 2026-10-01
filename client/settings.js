import { useEffect, useState } from "react";

const KEY = "hc_arena_settings";
export const DEFAULT_SETTINGS = {
  sounds: true,
  voiceEnabled: true,
  voiceMode: "push-to-talk",
  defaultVoiceScope: "all",
  muteOpponent: false,
  muteAll: false,
  muteTeam: false,
  mutedPeers: {},
  reducedMotion: false,
};

export function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("hc-settings-changed", { detail: next }));
  return next;
}

export function useSettings() {
  const [settings, setSettings] = useState(loadSettings);
  useEffect(() => {
    const onChange = (event) => setSettings(event.detail || loadSettings());
    window.addEventListener("hc-settings-changed", onChange);
    return () => window.removeEventListener("hc-settings-changed", onChange);
  }, []);
  return [settings, (patch) => setSettings(saveSettings(patch))];
}
