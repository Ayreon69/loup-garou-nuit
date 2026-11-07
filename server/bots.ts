// Les bots : ils ne savent que ce qu'un joueur saurait (leur carte, ce qu'ils ont vu la nuit, les annonces de la table).
// La nuit, ils choisissent au hasard comme tout le monde. Le jour, ils annoncent leur rôle (les Loups-Garous mentent),
// soupçonnent, puis votent : ils suivent les cartes qu'ils ont vues à travers les échanges, et repèrent les menteurs.
import { STEPS, type Ask, type Claim, type Place, type Role, type StepId, type Team, type Vision } from '../shared/protocol';
import { countOf, leftOf, teamOf } from '../shared/roles';
import type { Pick, Rng } from './game';

export type Skill = 'novice' | 'habile' | 'retors';
/** Le pilote automatique joue comme un bot novice. */
export const AUTOPILOT: Skill = 'novice';
const SKILLS: Skill[] = ['novice', 'habile', 'habile', 'retors'];

export function randomSkill(rnd: Rng = Math.random): Skill {
  return SKILLS[Math.floor(rnd() * SKILLS.length)];
}

/** Ce que le bot sait : jamais plus qu'un joueur à sa place. */
export interface BotInput {
  me: string;
  order: string[];
  roles: Role[];
  /** La carte reçue, telle qu'imprimée. */
  dealt: Role;
  /** Le rôle copié, pour le Doppelgänger. */
  copy: Role | null;
  visions: { step: StepId; vision: Vision }[];
  claims: Claim[];
}

/** Un payload d'annonce, comme celui qu'envoie un téléphone. */
export type ClaimPayload = Omit<Claim, 'n' | 'by'>;

function pickOne<T>(arr: readonly T[], rnd: Rng): T {
  return arr[Math.floor(rnd() * arr.length)];
}

function shuffled<T>(arr: readonly T[], rnd: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ───────────────────────────── La nuit ─────────────────────────────

export function botNight(input: BotInput, ask: Ask, skill: Skill, rnd: Rng): Pick {
  const others = shuffled(input.order.filter((x) => x !== input.me), rnd);
  const centers = shuffled([0, 1, 2], rnd);
  switch (ask) {
    case 'copy':
    case 'rob':
      return { players: [others[0]] };
    case 'swap':
      return { players: others.slice(0, 2) };
    case 'drunk':
    case 'peek':
      return { center: [centers[0]] };
    case 'seer': {
      // Regarder un joueur donne une piste directe ; le centre dit quels rôles ne sont pas en jeu.
      const player = skill === 'novice' ? 0.5 : 0.65;
      return rnd() < player ? { players: [others[0]] } : { center: centers.slice(0, 2) };
    }
  }
}

// ───────────────────────────── Le suivi des cartes ─────────────────────────────

const stepTime = (s: StepId): number => STEPS.indexOf(s);
const keyOf = (p: Place): string => ('player' in p ? `p:${p.player}` : `c:${p.center}`);
const pk = (id: string) => `p:${id}`;

interface Obs {
  t: number;
  key: string;
  role: Role;
  certain: boolean;
}
interface Swap {
  t: number;
  a: string;
  b: string;
  certain: boolean;
}

/** Où finit chaque carte observée, à travers les échanges qui ont suivi l'observation. */
function finalRoles(obs: Obs[], swaps: Swap[]): Map<string, { role: Role; certain: boolean }> {
  const sorted = [...swaps].sort((x, y) => x.t - y.t);
  const best = new Map<string, { role: Role; certain: boolean; t: number }>();
  for (const o of obs) {
    let key = o.key;
    let certain = o.certain;
    for (const s of sorted) {
      if (s.t <= o.t) continue;
      if (s.a === key) {
        key = s.b;
        certain &&= s.certain;
      } else if (s.b === key) {
        key = s.a;
        certain &&= s.certain;
      }
    }
    const prev = best.get(key);
    // Une observation sûre l'emporte sur une annonce ; à égalité, la plus récente.
    if (!prev || (certain && !prev.certain) || (certain === prev.certain && o.t >= prev.t)) best.set(key, { role: o.role, certain, t: o.t });
  }
  return new Map([...best].map(([k, v]) => [k, { role: v.role, certain: v.certain }]));
}

/** Mes propres observations de la nuit, toutes sûres. */
function ownKnowledge(input: BotInput): { obs: Obs[]; swaps: Swap[]; mates: Map<StepId, string[]> } {
  const dealtAs = input.dealt === 'doppel' ? (input.copy ?? 'doppel') : input.dealt;
  const obs: Obs[] = [{ t: -1, key: pk(input.me), role: dealtAs, certain: true }];
  const swaps: Swap[] = [];
  const mates = new Map<StepId, string[]>();
  for (const { step, vision } of input.visions) {
    const t = stepTime(step);
    if (vision.swap) swaps.push({ t, a: keyOf(vision.swap[0]), b: keyOf(vision.swap[1]), certain: true });
    // Le Voleur regarde sa nouvelle carte après l'échange.
    for (const c of vision.cards) obs.push({ t: vision.swap ? t + 0.5 : t, key: keyOf(c.place), role: c.role, certain: true });
    if (vision.mates) {
      mates.set(step, vision.mates);
      const role: Role | null = vision.as === 'macon' ? 'macon' : vision.as === 'loup' || vision.as === 'sbire' ? 'loup' : null;
      // Ceux qu'on a vus réveillés avaient reçu ce rôle (ils l'ont peut-être perdu depuis).
      if (role) for (const m of vision.mates) obs.push({ t: -0.5, key: pk(m), role, certain: true });
    }
  }
  return { obs, swaps, mates };
}

/** La dernière annonce de rôle de chacun. */
function roleClaims(claims: Claim[]): Map<string, Claim> {
  const out = new Map<string, Claim>();
  for (const c of claims) if (c.kind === 'role') out.set(c.by, c);
  return out;
}

export interface Mind {
  /** Ce que je crois être à la fin de la nuit ; null : je ne sais pas (Soûlard, carte échangée). */
  myRole: Role | null;
  team: Team;
  /** Les Loups-Garous que je connais (meute) au début de la nuit. */
  wolves: string[];
  /** Ce que je crois de la carte finale de chacun. */
  final: Map<string, { role: Role; certain: boolean }>;
  /** Plus c'est haut, plus le joueur semble mentir. */
  liar: Map<string, number>;
  /** Les Loups-Garous sont tous au centre, j'en suis sûr. */
  noWolf: boolean;
}

/** Ce que le bot pense de la table, à partir de sa nuit et des annonces. */
export function mindOf(input: BotInput, skill: Skill): Mind {
  const { obs, swaps, mates } = ownKnowledge(input);
  const others = input.order.filter((x) => x !== input.me);
  const claims = roleClaims(input.claims);
  const dealtAs = input.dealt === 'doppel' ? (input.copy ?? 'doppel') : input.dealt;

  // Ce que j'ai vu des cartes reçues par les autres (avant les échanges du Voleur et de la Noiseuse).
  const early = new Map<string, Role>();
  for (const o of obs) if (o.key.startsWith('p:') && o.t <= stepTime('voyante') && o.key !== pk(input.me)) early.set(o.key.slice(2), o.role);
  const centerSeen: Role[] = obs.filter((o) => o.key.startsWith('c:') && o.t < stepTime('soulard')).map((o) => o.role);

  // 1. Les menteurs évidents.
  const liar = new Map<string, number>(others.map((id) => [id, 0]));
  const bump = (id: string, v: number) => liar.has(id) && liar.set(id, liar.get(id)! + v);
  const claimants = new Map<Role, string[]>();
  for (const [by, c] of claims) if (c.role) claimants.set(c.role, [...(claimants.get(c.role) ?? []), by]);
  for (const [by, c] of claims) {
    if (by === input.me) continue;
    const role = c.role!;
    const seen = early.get(by);
    // Il dit avoir reçu autre chose que ce que j'ai vu devant lui.
    if (seen && seen !== role && seen !== 'doppel') bump(by, 1.5);
    // Il dit être un Loup-Garou : rare, sauf pour le Tanneur qui veut mourir.
    if (role === 'loup') bump(by, skill === 'retors' ? 0.8 : 1.6);
    const others = (claimants.get(role) ?? []).filter((x) => x !== input.me);
    const copies = countOf(input.roles, role);
    // Je suis ce rôle, et il n'y en a qu'un : l'autre ment.
    const iAmIt = dealtAs === role && teamOf(role) === 'village' && copies === 1;
    if (iAmIt) bump(by, 1.6);
    else if (others.length + (dealtAs === role ? 1 : 0) > copies) bump(by, skill === 'novice' ? 0.4 : 0.8);
    // Ce rôle unique, je l'ai vu au centre.
    if (copies === 1 && centerSeen.includes(role)) bump(by, 1.4);
    // Un rôle unique que j'ai vu devant quelqu'un d'autre.
    if (copies === 1 && [...early].some(([id, r]) => r === role && id !== by)) bump(by, 1.4);
    // Francs-Maçons : je connais l'autre (ou je sais qu'il est au centre).
    if (dealtAs === 'macon' && role === 'macon' && mates.has('macons') && !mates.get('macons')!.includes(by)) bump(by, 1.6);
    // Ce qu'il dit avoir vu de ma carte est faux.
    if ((role === 'voyante' || role === 'voleur') && c.players?.[0] === input.me && c.saw?.[0] && c.saw[0] !== input.dealt) bump(by, 1.4);
  }

  // 2. Les cartes à la fin de la nuit : mes observations, et pour les plus habiles, ce qu'annoncent les joueurs crédibles.
  const allObs = [...obs];
  const allSwaps = [...swaps];
  if (skill !== 'novice') {
    const trusted = (id: string) => id !== input.me && (liar.get(id) ?? 0) < 0.8;
    for (const [by, c] of claims) {
      if (!trusted(by)) continue;
      const role = c.role!;
      if (role !== 'loup' && role !== 'tanneur' && role !== 'sbire' && role !== 'doppel') allObs.push({ t: -1, key: pk(by), role, certain: false });
      if (role === 'voyante' && c.saw) {
        if (c.players?.[0]) allObs.push({ t: stepTime('voyante'), key: pk(c.players[0]), role: c.saw[0], certain: false });
        else if (c.center?.length === 2) c.center.forEach((k, i) => c.saw![i] && allObs.push({ t: stepTime('voyante'), key: `c:${k}`, role: c.saw![i], certain: false }));
      }
      if (role === 'voleur' && c.players?.[0]) allSwaps.push({ t: stepTime('voleur'), a: pk(by), b: pk(c.players[0]), certain: false });
      if (role === 'noiseuse' && c.players?.length === 2) allSwaps.push({ t: stepTime('noiseuse'), a: pk(c.players[0]), b: pk(c.players[1]), certain: false });
      if (role === 'soulard' && c.center?.length === 1) allSwaps.push({ t: stepTime('soulard'), a: pk(by), b: `c:${c.center[0]}`, certain: false });
      if (role === 'insomniaque' && c.saw?.[0]) allObs.push({ t: stepTime('insomniaque'), key: pk(by), role: c.saw[0], certain: false });
    }
  }
  // Le novice ne suit pas les échanges annoncés : il ne retient que ce qu'il a vu et fait lui-même.
  const final = finalRoles(allObs, allSwaps);

  // 3. Qui suis-je, à la fin ?
  const mine = final.get(pk(input.me));
  const iWasDrunk = input.visions.some((v) => v.vision.as === 'soulard' && v.vision.swap);
  let myRole: Role | null = mine && !(iWasDrunk && mine.role === dealtAs) ? mine.role : null;
  if (myRole === 'doppel') myRole = null;
  const team: Team = myRole ? teamOf(myRole) : 'village';

  // 4. La meute que je connais.
  const wolves = new Set<string>();
  if (dealtAs === 'loup') {
    wolves.add(input.me);
    for (const m of mates.get('loups') ?? []) wolves.add(m);
  }
  for (const v of input.visions) if (v.vision.as === 'sbire' && v.vision.mates) for (const m of v.vision.mates) wolves.add(m);

  // 5. Tous les Loups-Garous sont au centre ?
  const loups = countOf(input.roles, 'loup');
  let centerWolves = 0;
  for (const [k, v] of final) if (k.startsWith('c:') && v.certain && v.role === 'loup') centerWolves++;
  const noWolf = loups > 0 && centerWolves >= loups;

  const finalPlayers = new Map<string, { role: Role; certain: boolean }>();
  for (const [k, v] of final) if (k.startsWith('p:')) finalPlayers.set(k.slice(2), v);
  return { myRole, team, wolves: [...wolves], final: finalPlayers, liar, noWolf };
}

// ───────────────────────────── Les soupçons ─────────────────────────────

/** Plus c'est haut, plus le joueur est suspect aux yeux du village (vu par ce bot). */
function suspicion(input: BotInput, mind: Mind, skill: Skill, rnd: Rng): Map<string, number> {
  const others = input.order.filter((x) => x !== input.me);
  const claims = roleClaims(input.claims);
  const noise = skill === 'novice' ? 0.6 : skill === 'habile' ? 0.35 : 0.15;
  const score = new Map<string, number>();
  for (const id of others) {
    let s = 0.7 * (mind.liar.get(id) ?? 0);
    const f = mind.final.get(id);
    if (f) s += f.role === 'loup' ? (f.certain ? 4 : 2.4) : f.role === 'tanneur' ? -2 : f.certain ? -1.6 : -0.6;
    const c = claims.get(id);
    if (!c) s += 0.5;
    else if (c.role === 'tanneur') s -= 1.5;
    for (const a of input.claims) {
      if (a.kind !== 'suspect' || a.players?.[0] !== id || a.by === input.me) continue;
      const trust = Math.max(0, 1 - (mind.liar.get(a.by) ?? 0));
      s += 0.35 * trust;
    }
    s += (rnd() - 0.5) * 2 * noise;
    score.set(id, s);
  }
  return score;
}

function argmax(score: Map<string, number>, among: string[]): string | null {
  let best: string | null = null;
  let bestV = -Infinity;
  for (const id of among) {
    const v = score.get(id) ?? -Infinity;
    if (v > bestV) {
      best = id;
      bestV = v;
    }
  }
  return best;
}

/** Ceux qui croient qu'aucun Loup-Garou n'est parmi nous, et qui semblent sincères. */
function trustsNoWolf(input: BotInput, mind: Mind): boolean {
  return input.claims.some((c) => c.kind === 'noWolf' && c.by !== input.me && (mind.liar.get(c.by) ?? 0) < 0.5);
}

/** Le camp que le bot défend : celui de la carte qu'il croit avoir. */
function sideOf(input: BotInput, mind: Mind): Team {
  if (mind.myRole) return mind.team;
  return 'village';
}

/** Le vote d'un bot. */
export function botVote(input: BotInput, skill: Skill, rnd: Rng): string {
  const mind = mindOf(input, skill);
  const others = input.order.filter((x) => x !== input.me);
  const score = suspicion(input, mind, skill, rnd);
  const side = sideOf(input, mind);
  if (side === 'tanneur') return pickOne(others, rnd);
  if (side === 'meute') {
    const knownWolves = new Set(mind.wolves);
    if (mind.myRole === 'loup') knownWolves.add(input.me);
    const prey = others.filter((x) => !knownWolves.has(x));
    // Sans Loup-Garou parmi les joueurs, le Sbire veut qu'un joueur du village meure : il vote comme la meute.
    const claims = roleClaims(input.claims);
    const myClaim = claims.get(input.me);
    const target = new Map<string, number>();
    for (const id of prey) {
      let s = score.get(id) ?? 0;
      // Celui qui annonce le même rôle que moi me menace : c'est lui qu'il faut faire tomber.
      if (myClaim?.role && claims.get(id)?.role === myClaim.role && countOf(input.roles, myClaim.role) === 1) s += 1.5;
      // Celui qui m'accuse aussi.
      if (input.claims.some((c) => c.kind === 'suspect' && c.by === id && c.players?.[0] === input.me)) s += 0.8;
      if (claims.get(id)?.role === 'tanneur') s -= 3;
      // Un menteur qui n'est pas de la meute, quand le Tanneur est en jeu : c'est sans doute lui. Surtout ne pas le tuer.
      if (skill !== 'novice' && input.roles.includes('tanneur')) s -= 1.5 * (mind.liar.get(id) ?? 0);
      target.set(id, s);
    }
    return argmax(target, prey.length ? prey : others) ?? others[0];
  }
  // Village : sûr qu'aucun Loup-Garou n'est parmi nous, ou convaincu par quelqu'un de sincère.
  const max = Math.max(...others.map((id) => score.get(id) ?? 0));
  if (mind.noWolf) return leftOf(input.order, input.me);
  const follow = skill === 'novice' ? 0.45 : skill === 'habile' ? 0.7 : 0.8;
  if (trustsNoWolf(input, mind) && max < 1.2 && rnd() < follow) return leftOf(input.order, input.me);
  return argmax(score, others) ?? others[0];
}

/** Le suspect qu'un bot désigne à voix haute, ou null s'il n'a pas d'avis tranché. */
export function botAccuse(input: BotInput, skill: Skill, rnd: Rng, already: string[]): string | null {
  const mind = mindOf(input, skill);
  const side = sideOf(input, mind);
  const others = input.order.filter((x) => x !== input.me && !already.includes(x));
  if (!others.length || side === 'tanneur') return null;
  const score = suspicion(input, mind, skill, rnd);
  if (side === 'meute') {
    const prey = others.filter((x) => !mind.wolves.includes(x));
    const best = argmax(score, prey);
    return best && rnd() < 0.6 ? best : null;
  }
  const best = argmax(score, others);
  return best && (score.get(best) ?? 0) >= 0.9 ? best : null;
}

/** Le bot annonce qu'aucun Loup-Garou n'est parmi les joueurs : seulement s'il en est sûr. */
export function botNoWolf(input: BotInput, skill: Skill): boolean {
  const mind = mindOf(input, skill);
  return mind.noWolf && sideOf(input, mind) === 'village';
}

// ───────────────────────────── Les annonces ─────────────────────────────

/** La vérité sur sa nuit, telle que le bot l'a vécue. */
function truthfulClaim(input: BotInput): ClaimPayload {
  const role = input.dealt;
  const v = (as: Role) => input.visions.find((x) => x.vision.as === as && (x.vision.cards.length || x.vision.swap || x.vision.mates))?.vision;
  switch (role) {
    case 'doppel': {
      const look = input.visions.find((x) => x.step === 'doppel')?.vision;
      const c = look?.cards[0];
      return c && 'player' in c.place ? { kind: 'role', role, players: [c.place.player], saw: [c.role] } : { kind: 'role', role };
    }
    case 'voyante': {
      const x = v('voyante');
      if (!x?.cards.length) return { kind: 'role', role };
      const first = x.cards[0].place;
      if ('player' in first) return { kind: 'role', role, players: [first.player], saw: [x.cards[0].role] };
      return { kind: 'role', role, center: x.cards.map((c) => ('center' in c.place ? c.place.center : 0)), saw: x.cards.map((c) => c.role) };
    }
    case 'voleur': {
      const x = v('voleur');
      const other = x?.swap?.find((p) => 'player' in p && p.player !== input.me);
      return other && 'player' in other ? { kind: 'role', role, players: [other.player], saw: x!.cards[0] ? [x!.cards[0].role] : [] } : { kind: 'role', role };
    }
    case 'noiseuse': {
      const x = v('noiseuse');
      return x?.swap ? { kind: 'role', role, players: x.swap.map((p) => ('player' in p ? p.player : '')).filter(Boolean) } : { kind: 'role', role };
    }
    case 'soulard': {
      const x = v('soulard');
      const c = x?.swap?.find((p) => 'center' in p);
      return c && 'center' in c ? { kind: 'role', role, center: [c.center] } : { kind: 'role', role };
    }
    case 'insomniaque': {
      const x = input.visions.find((y) => y.step === 'insomniaque')?.vision;
      return x?.cards[0] ? { kind: 'role', role, saw: [x.cards[0].role] } : { kind: 'role', role };
    }
    case 'macon': {
      const x = input.visions.find((y) => y.step === 'macons')?.vision;
      if (!x) return { kind: 'role', role };
      return x.mates?.length ? { kind: 'role', role, players: [x.mates[0]] } : { kind: 'role', role, alone: true };
    }
    default:
      return { kind: 'role', role };
  }
}

/** Les rôles déjà annoncés autant de fois qu'il y a de cartes : les reprendre serait se dénoncer. */
function exhausted(input: BotInput, role: Role): boolean {
  const n = input.claims.filter((c) => c.kind === 'role' && c.role === role && c.by !== input.me).length;
  return n >= countOf(input.roles, role);
}

/** Le mensonge d'un membre de la meute (ou d'un Tanneur). */
function lieClaim(input: BotInput, mind: Mind, skill: Skill, rnd: Rng): ClaimPayload {
  const inPlay = [...new Set(input.roles)];
  const others = input.order.filter((x) => x !== input.me);
  const innocents = others.filter((x) => !mind.wolves.includes(x));
  const centerSeen = input.visions.flatMap((v) => (v.vision.as === 'loup' ? v.vision.cards : [])).find((c) => 'center' in c.place);

  // Le Tanneur veut paraître suspect : il revendique un rôle unique déjà pris, ou dit des choses bizarres.
  if (mind.team === 'tanneur' || (input.dealt === 'tanneur' && !mind.myRole)) {
    const taken = input.claims.filter((c) => c.kind === 'role' && c.by !== input.me && c.role && countOf(input.roles, c.role) === 1 && teamOf(c.role) === 'village');
    if (taken.length && rnd() < 0.25) return { kind: 'role', role: pickOne(taken, rnd).role! };
    if (input.roles.includes('villageois') && !exhausted(input, 'villageois') && rnd() < 0.5) return { kind: 'role', role: 'villageois' };
    const village = inPlay.filter((r) => teamOf(r) === 'village' && r !== 'doppel');
    const free = village.filter((r) => !exhausted(input, r));
    // Tous les rôles du village sont déjà pris : il en revendique un quand même, ce qui le rend suspect.
    return detailedLie(pickOne(free.length ? free : village.length ? village : inPlay, rnd)!, input, input.order.filter((x) => x !== input.me), rnd);
  }

  // Le Voleur devenu Loup-Garou garde son histoire, mais ment sur la carte volée.
  if (input.dealt === 'voleur' && mind.myRole === 'loup') {
    const robbed = input.visions.find((v) => v.step === 'voleur')?.vision.swap?.find((p) => 'player' in p && p.player !== input.me);
    const fake = inPlay.includes('villageois') ? 'villageois' : pickOne(inPlay.filter((r) => teamOf(r) === 'village' && r !== 'voleur' && r !== 'doppel'), rnd);
    if (fake && robbed && 'player' in robbed) return { kind: 'role', role: 'voleur', players: [robbed.player], saw: [fake] };
  }

  // Seul Loup-Garou : la carte vue au centre, personne ne l'a.
  if (centerSeen && teamOf(centerSeen.role) === 'village' && centerSeen.role !== 'doppel' && !exhausted(input, centerSeen.role) && rnd() < (skill === 'novice' ? 0.6 : 0.9))
    return detailedLie(centerSeen.role, input, innocents, rnd);

  const weights: [Role, number][] = [];
  for (const r of inPlay) {
    if (teamOf(r) !== 'village' || r === 'doppel' || exhausted(input, r)) continue;
    const w =
      r === 'villageois' ? 3 : r === 'soulard' ? 2.2 : r === 'noiseuse' ? (skill === 'novice' ? 0.8 : 2) : r === 'insomniaque' ? 1 : r === 'voyante' ? (skill === 'retors' ? 1.8 : 0.6) : r === 'chasseur' ? 1 : r === 'macon' ? 0.4 : 0.8;
    weights.push([r, w]);
  }
  if (!weights.length) {
    const village = inPlay.filter((r) => teamOf(r) === 'village' && r !== 'doppel');
    return { kind: 'role', role: inPlay.includes('villageois') ? 'villageois' : (village[0] ?? inPlay[0]) };
  }
  let roll = rnd() * weights.reduce((s, [, w]) => s + w, 0);
  for (const [r, w] of weights) {
    roll -= w;
    if (roll <= 0) return detailedLie(r, input, innocents, rnd);
  }
  return detailedLie(weights[0][0], input, innocents, rnd);
}

/** Un mensonge crédible, avec ses détails. */
function detailedLie(role: Role, input: BotInput, innocents: string[], rnd: Rng): ClaimPayload {
  const pool = innocents.length ? innocents : input.order.filter((x) => x !== input.me);
  const two = shuffled(pool, rnd).slice(0, 2);
  const safeSeen = (['villageois', 'chasseur', 'insomniaque', 'soulard'] as Role[]).filter((r) => input.roles.includes(r));
  switch (role) {
    case 'soulard':
      return { kind: 'role', role, center: [Math.floor(rnd() * 3)] };
    case 'noiseuse':
      return two.length === 2 ? { kind: 'role', role, players: two } : { kind: 'role', role };
    case 'insomniaque':
      return { kind: 'role', role, saw: ['insomniaque'] };
    case 'voyante':
      return two[0] && safeSeen.length ? { kind: 'role', role, players: [two[0]], saw: [pickOne(safeSeen, rnd)] } : { kind: 'role', role };
    case 'voleur':
      return two[0] && safeSeen.length ? { kind: 'role', role, players: [two[0]], saw: [pickOne(safeSeen, rnd)] } : { kind: 'role', role };
    default:
      return { kind: 'role', role };
  }
}

/** L'annonce de rôle d'un bot : la vérité pour le village, un mensonge pour la meute et le Tanneur. */
export function botClaim(input: BotInput, skill: Skill, rnd: Rng): ClaimPayload {
  const mind = mindOf(input, skill);
  const dealtAs = input.dealt === 'doppel' ? (input.copy ?? 'doppel') : input.dealt;
  const lies = teamOf(dealtAs) !== 'village' || mind.team === 'meute' || mind.team === 'tanneur';
  if (!lies) return truthfulClaim(input);
  return lieClaim(input, mind, skill, rnd);
}
