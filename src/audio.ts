let muted = localStorage.getItem("brc-mute") === "1";
let reduced = localStorage.getItem("brc-motion") === "1";
let ctx: AudioContext | null = null;

export function isMuted() {
  return muted;
}
export function isReducedMotion() {
  return reduced;
}
export function setMuted(v: boolean) {
  muted = v;
  localStorage.setItem("brc-mute", v ? "1" : "0");
}
export function setReducedMotion(v: boolean) {
  reduced = v;
  localStorage.setItem("brc-motion", v ? "1" : "0");
  document.documentElement.classList.toggle("reduce-motion", v);
}

export function initMotion() {
  document.documentElement.classList.toggle("reduce-motion", reduced);
}

function ac() {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export function sfx(kind: "click" | "lock" | "hit" | "heal" | "elim" | "win" | "crate" | "warn") {
  if (muted) return;
  try {
    const c = ac();
    const o = c.createOscillator();
    const g = c.createGain();
    o.connect(g);
    g.connect(c.destination);
    const now = c.currentTime;
    const map: Record<typeof kind, [number, number, OscillatorType]> = {
      click: [420, 0.05, "triangle"],
      lock: [240, 0.12, "square"],
      hit: [140, 0.16, "sawtooth"],
      heal: [520, 0.18, "sine"],
      elim: [90, 0.4, "sawtooth"],
      win: [660, 0.35, "triangle"],
      crate: [380, 0.2, "square"],
      warn: [180, 0.22, "square"],
    };
    const [f, d, t] = map[kind];
    o.type = t;
    o.frequency.setValueAtTime(f, now);
    g.gain.setValueAtTime(0.05, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + d);
    o.start(now);
    o.stop(now + d);
  } catch {
    /* autoplay restrictions */
  }
}
