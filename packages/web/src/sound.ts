// Optional synthesised sound effects (WebAudio only, no audio files). Off by default.
import { useEffect, useState } from "react";

const KEY = "tavern.sound";
let enabled = (() => { try { return localStorage.getItem(KEY) === "on"; } catch { return false; } })();
const listeners = new Set<(v: boolean) => void>();
let ctx: AudioContext | null = null;

export function soundEnabled() { return enabled; }
export function setSound(v: boolean) {
  enabled = v;
  try { localStorage.setItem(KEY, v ? "on" : "off"); } catch { /* ignore */ }
  listeners.forEach((l) => l(v));
  if (v) audio();
}
export function useSound(): [boolean, (v: boolean) => void] {
  const [v, set] = useState(enabled);
  useEffect(() => { listeners.add(set); return () => { listeners.delete(set); }; }, []);
  return [v, setSound];
}

function audio(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch { return null; }
}

function noise(a: AudioContext, dur: number) {
  const buf = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  return src;
}

let lastPlay = 0;
function throttle() { const n = performance.now(); if (n - lastPlay < 60) return false; lastPlay = n; return true; }

/** Wooden dice clatter: a handful of short filtered clicks. */
export function playDice() {
  const a = audio(); if (!a || !throttle()) return;
  for (let i = 0; i < 6; i++) {
    const t = a.currentTime + i * 0.05 + Math.random() * 0.03;
    const src = noise(a, 0.03);
    const f = a.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1800 + Math.random() * 1600; f.Q.value = 4;
    const g = a.createGain(); g.gain.setValueAtTime(0.25 * (1 - i / 7), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    src.connect(f).connect(g).connect(a.destination); src.start(t); src.stop(t + 0.05);
  }
}

/** Dull impact thud. */
export function playHit() {
  const a = audio(); if (!a || !throttle()) return;
  const t = a.currentTime;
  const o = a.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
  const g = a.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.25);
  const n = noise(a, 0.08); const ng = a.createGain(); ng.gain.setValueAtTime(0.15, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  n.connect(ng).connect(a.destination); n.start(t);
}

/** Rising filtered whoosh for spells. */
export function playWhoosh() {
  const a = audio(); if (!a || !throttle()) return;
  const t = a.currentTime;
  const n = noise(a, 0.6);
  const f = a.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 3; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(3200, t + 0.5);
  const g = a.createGain(); g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.15); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  n.connect(f).connect(g).connect(a.destination); n.start(t); n.stop(t + 0.6);
}
