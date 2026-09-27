import { loadSettings } from "./settings.js";

let context = null;

export function playUiSound(kind = "tap") {
  if (!loadSettings().sounds || typeof window === "undefined") return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  try {
    context ||= new AudioContext();
    if (context.state === "suspended") context.resume().catch(() => {});
  } catch {
    return;
  }

  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const notes = { tap: 440, confirm: 660, pick: 520, back: 330 };
  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(notes[kind] || notes.tap, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.035, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === "confirm" ? 0.09 : 0.055));
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.1);
}
