// La voix du narrateur : des répliques enregistrées (client/public/voix/<nom>.mp3), jouées par le Web Audio.
// Par défaut sur le téléphone de l'hôte, comme le meneur qui parle à toute la table ; chacun peut l'allumer
// ou l'éteindre chez lui. Si un fichier manque, la synthèse vocale du téléphone prend le relais.
import { voiceLines } from '../../../shared/roles';

const TEXT = voiceLines();
const GAP = 0.55; // silence entre deux répliques (« rendors-toi », puis le rôle suivant)
const LEAD = 0.35; // le gong ou le hibou sonne d'abord

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let playing: AudioBufferSourceNode[] = [];
let token = 0;
const cache = new Map<string, Promise<AudioBuffer | null>>();

function context(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      out = ctx.createGain();
      out.gain.value = 1;
      out.connect(ctx.destination);
    }
    return ctx;
  } catch {
    return null;
  }
}

function synth(): SpeechSynthesis | null {
  try {
    return 'speechSynthesis' in window ? window.speechSynthesis : null;
  } catch {
    return null;
  }
}

export function voiceSupported(): boolean {
  return typeof window !== 'undefined' && (!!(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext) || !!synth());
}

/** Le navigateur ne laisse jouer du son qu'après un geste : on réveille le contexte à chaque toucher. */
export function unlockVoice(): void {
  const a = context();
  if (a && a.state === 'suspended') void a.resume().catch(() => undefined);
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlockVoice, { capture: true, passive: true });
  window.addEventListener('keydown', unlockVoice, { capture: true, passive: true });
}

function load(id: string): Promise<AudioBuffer | null> {
  let p = cache.get(id);
  if (!p) {
    p = (async () => {
      const a = context();
      if (!a) return null;
      const res = await fetch(`/voix/${id}.mp3`);
      if (!res.ok) throw new Error(String(res.status));
      return await a.decodeAudioData(await res.arrayBuffer());
    })().catch(() => {
      cache.delete(id);
      return null;
    });
    cache.set(id, p);
  }
  return p;
}

/** Charge à l'avance les répliques d'une partie, pour qu'elles partent à l'heure. */
export function prefetchVoice(ids: string[]): void {
  for (const id of ids) if (TEXT[id]) void load(id);
}

function speakText(text: string): void {
  const s = synth();
  if (!s) return;
  try {
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-FR';
    u.rate = 0.95;
    u.pitch = 0.9;
    s.speak(u);
  } catch {
    /* non supporté */
  }
}

/** Dit une suite de répliques, l'une après l'autre ; coupe ce qui se disait avant. */
export function say(ids: string[]): void {
  hush();
  const mine = ++token;
  const known = ids.filter((id) => TEXT[id]);
  if (!known.length) return;
  void Promise.all(known.map(load)).then((buffers) => {
    if (mine !== token) return;
    const a = context();
    if (!a || !out || buffers.some((b) => !b)) {
      speakText(known.map((id) => TEXT[id]).join(' '));
      return;
    }
    let t = a.currentTime + LEAD;
    for (const b of buffers as AudioBuffer[]) {
      const src = a.createBufferSource();
      src.buffer = b;
      src.connect(out);
      src.start(t);
      src.onended = () => {
        playing = playing.filter((x) => x !== src);
      };
      playing.push(src);
      t += b.duration + GAP;
    }
  });
}

export function hush(): void {
  token++;
  for (const src of playing) {
    try {
      src.stop();
    } catch {
      /* déjà fini */
    }
  }
  playing = [];
  try {
    synth()?.cancel();
  } catch {
    /* rien */
  }
}
