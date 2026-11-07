// Sons synthétisés (Web Audio), aucun fichier à charger : carte de carton qu'on retourne, gong de réveil,
// hibou à la tombée de la nuit, cloche de l'aube, tambour du vote, et un hurlement lointain au dévoilement.
import { useStore } from '../store';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!useStore.getState().prefs.sound) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; slide?: number; attack?: number; vibrato?: number } = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * opts.slide), t0 + dur);
  if (opts.vibrato) {
    const lfo = a.createOscillator();
    const lg = a.createGain();
    lfo.frequency.value = 5.5;
    lg.gain.value = opts.vibrato;
    lfo.connect(lg).connect(osc.frequency);
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.05);
  }
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.1, t0 + (opts.attack ?? 0.006));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur: number, opts: { gain?: number; delay?: number; freq?: number; type?: BiquadFilterType; q?: number; fade?: number; sweep?: number } = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const buffer = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
  const data = buffer.getChannelData(0);
  const fade = opts.fade ?? 2;
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** fade;
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = opts.type ?? 'bandpass';
  filter.frequency.setValueAtTime(opts.freq ?? 2400, t0);
  if (opts.sweep) filter.frequency.exponentialRampToValueAtTime(opts.sweep, t0 + dur);
  if (opts.q) filter.Q.value = opts.q;
  const g = a.createGain();
  g.gain.value = opts.gain ?? 0.25;
  src.connect(filter).connect(g).connect(a.destination);
  src.start(t0);
}

export const sfx = {
  /** Une carte de carton qu'on retourne. */
  flip: () => noise(0.09, { gain: 0.22, freq: 1800, sweep: 4200, q: 0.8, fade: 2.5 }),
  /** Toucher une carte (choix, ou geste pour brouiller les pistes). */
  tap: () => noise(0.035, { gain: 0.16, freq: 2600, q: 3, fade: 6 }),
  /** Deux cartes qui glissent l'une contre l'autre. */
  swap: () => {
    noise(0.18, { gain: 0.16, freq: 1400, sweep: 3200, type: 'bandpass', q: 1, fade: 1.5 });
    noise(0.14, { gain: 0.12, freq: 2800, sweep: 1600, type: 'bandpass', q: 1, fade: 1.5, delay: 0.12 });
  },
  /** La nuit tombe : le hibou. */
  owl: () => {
    tone(392, 0.32, { gain: 0.07, slide: 0.94, attack: 0.05 });
    tone(370, 0.55, { gain: 0.07, delay: 0.42, slide: 0.9, attack: 0.06, vibrato: 4 });
  },
  /** Un rôle se réveille : un petit gong étouffé. */
  gong: () => {
    tone(196, 1.3, { type: 'sine', gain: 0.06, attack: 0.004 });
    tone(392.4, 0.8, { type: 'sine', gain: 0.025 });
    tone(587, 0.5, { type: 'sine', gain: 0.012 });
  },
  /** C'est à moi. */
  mine: () => {
    tone(659.25, 0.28, { gain: 0.06 });
    tone(987.77, 0.36, { gain: 0.05, delay: 0.12 });
  },
  /** L'aube : une cloche claire. */
  dawn: () => [523.25, 659.25, 783.99].forEach((f, i) => tone(f, 0.9, { gain: 0.045, delay: i * 0.16 })),
  /** Une annonce arrive. */
  claim: () => tone(880, 0.12, { type: 'triangle', gain: 0.035 }),
  /** Le vote : un roulement de tambour. */
  drum: (beat = 0) => {
    noise(0.12, { gain: 0.35, freq: 140 + beat * 20, q: 1.4, fade: 3 });
    tone(80 + beat * 8, 0.18, { gain: 0.09, slide: 0.7 });
  },
  /** Un tic de l'horloge, les dernières secondes. */
  tick: () => noise(0.02, { gain: 0.08, freq: 3600, q: 4, fade: 8 }),
  /** Éliminé : un coup sourd. */
  thud: () => {
    noise(0.22, { gain: 0.4, freq: 220, q: 1, fade: 3 });
    tone(70, 0.4, { gain: 0.12, slide: 0.6 });
  },
  /** Le hurlement lointain, au dévoilement d'un Loup-Garou. */
  howl: () => {
    tone(330, 1.6, { type: 'sawtooth', gain: 0.018, slide: 1.6, attack: 0.4, vibrato: 6 });
    tone(330, 1.6, { type: 'sine', gain: 0.05, slide: 1.6, attack: 0.4, vibrato: 6 });
  },
  /** Fin de partie : victoire ou défaite. */
  fanfare: (good: boolean) => {
    const notes = good ? [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.51] : [440, 392, 349.23, 293.66];
    notes.forEach((f, i) => tone(f, 0.4, { type: 'triangle', gain: 0.045, delay: i * 0.12 }));
  },
};
