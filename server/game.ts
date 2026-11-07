// Moteur d'une partie de Loup-Garou pour une Nuit, sans réseau : distribution, nuit étape par étape,
// échanges de cartes, Doppelgänger, débat (annonces), vote et résolution.
import { CENTER, type Ask, type ChatLine, type Claim, type NightEvent, type Outcome, type Place, type Role, type Stage, type StepId, type Vision, isRole } from '../shared/protocol';
import { effective, nightSteps, resolveVote, sortRoles } from '../shared/roles';

export type Rng = () => number;

export interface Card {
  id: number;
  role: Role;
  copy: Role | null;
}

export function shuffle<T>(arr: T[], rnd: Rng = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Un joueur réveillé pendant l'étape en cours. */
export interface Awake {
  as: Role;
  ask: Ask | null;
  seen: Vision[];
  /** A choisi lui-même (et pas l'appli à sa place). */
  acted: boolean;
}

export interface Pick {
  players?: unknown;
  center?: unknown;
}

/** Les gestes qu'on ne peut pas refuser : le livret dit « échange », pas « peut échanger ». */
export const MANDATORY: readonly Ask[] = ['copy', 'rob', 'swap', 'drunk'];
const MAX_CLAIMS_EACH = 16;
const MAX_CHAT = 150;

export class Game {
  readonly order: string[];
  readonly roles: Role[];
  readonly steps: StepId[];
  /** Toutes les cartes, par numéro. */
  readonly cards: Card[];
  readonly startHand = new Map<string, Card>();
  readonly centerStart: Card[];
  /** La carte devant chaque joueur, maintenant. */
  hand = new Map<string, Card>();
  center: Card[];
  stage: Stage = 'deal';
  /** Étape de nuit : -1 quand la nuit tombe, steps.length quand le jour se lève. */
  step = -1;
  /** Distribution : a vu sa carte. Jour : prêt à voter. Vote : a voté. */
  ready = new Set<string>();
  awake = new Map<string, Awake>();
  events: NightEvent[] = [];
  /** Tout ce que chacun a vu la nuit : pour les bots et le dévoilement, jamais envoyé pendant la partie. */
  visions = new Map<string, { step: StepId; vision: Vision }[]>();
  claims: Claim[] = [];
  chat: ChatLine[] = [];
  votes = new Map<string, string>();
  autoVotes = new Set<string>();
  outcome: Outcome | null = null;
  private rnd: Rng;

  /** deal : l'ordre des cartes (les joueurs dans l'ordre, puis les trois du centre), pour les tests. */
  constructor(order: string[], roles: Role[], rnd: Rng = Math.random, deal?: Role[]) {
    this.order = [...order];
    this.roles = sortRoles(roles);
    this.steps = nightSteps(this.roles);
    this.rnd = rnd;
    const dealt = deal ? [...deal] : shuffle(this.roles, rnd);
    if (dealt.length !== order.length + CENTER) throw new Error(`Il faut ${order.length + CENTER} cartes.`);
    this.cards = dealt.map((role, id) => ({ id, role, copy: null }));
    order.forEach((id, i) => {
      this.startHand.set(id, this.cards[i]);
      this.hand.set(id, this.cards[i]);
    });
    this.center = this.cards.slice(order.length);
    this.centerStart = [...this.center];
    for (const id of order) this.visions.set(id, []);
  }

  has(id: string): boolean {
    return this.hand.has(id);
  }

  /** Le rôle de la carte devant un joueur, maintenant. */
  roleOf(id: string): Role {
    return effective(this.hand.get(id)!);
  }

  /** Le rôle reçu (la copie pour le Doppelgänger, une fois faite). */
  dealtAs(id: string): Role {
    return effective(this.startHand.get(id)!);
  }

  // ───────────────────────────── Distribution ─────────────────────────────

  markSeen(id: string): void {
    if (this.stage === 'deal' && this.has(id)) this.ready.add(id);
  }

  get allReady(): boolean {
    return this.order.every((id) => this.ready.has(id));
  }

  // ───────────────────────────── Nuit ─────────────────────────────

  startNight(): void {
    this.stage = 'night';
    this.step = -1;
    this.ready.clear();
    this.awake.clear();
  }

  get dawn(): boolean {
    return this.stage === 'night' && this.step >= this.steps.length;
  }

  get currentStep(): StepId | null {
    return this.stage === 'night' && this.step >= 0 && this.step < this.steps.length ? this.steps[this.step] : null;
  }

  /** Termine l'étape en cours (les gestes obligatoires oubliés sont faits au hasard), puis réveille les suivants. */
  nextStep(): void {
    if (this.stage !== 'night' || this.dawn) return;
    this.finishStep();
    this.step++;
    this.awake.clear();
    const step = this.currentStep;
    if (step) this.beginStep(step);
  }

  /** Ceux qui ont reçu une carte de Loup-Garou (ou l'ont copiée) : ils se réveillent comme Loups et lèvent le pouce pour le Sbire. */
  private wakingWolves(): string[] {
    return this.order.filter((id) => this.dealtAs(id) === 'loup');
  }

  private beginStep(step: StepId): void {
    const dealtRole = (id: string) => this.startHand.get(id)!.role;
    const wake = (id: string, as: Role, ask: Ask | null, auto?: Vision) => {
      const a: Awake = { as, ask, seen: [], acted: false };
      this.awake.set(id, a);
      if (auto) this.record(id, step, auto, false);
    };
    switch (step) {
      case 'doppel':
        for (const id of this.order) if (dealtRole(id) === 'doppel') wake(id, 'doppel', 'copy');
        return;
      case 'loups': {
        const wolves = this.wakingWolves();
        for (const id of wolves) wake(id, 'loup', wolves.length === 1 ? 'peek' : null, { as: 'loup', cards: [], mates: wolves.filter((x) => x !== id) });
        return;
      }
      case 'sbire': {
        const wolves = this.wakingWolves();
        for (const id of this.order) if (dealtRole(id) === 'sbire') wake(id, 'sbire', null, { as: 'sbire', cards: [], mates: wolves });
        return;
      }
      case 'macons': {
        const masons = this.order.filter((id) => this.dealtAs(id) === 'macon');
        for (const id of masons) wake(id, 'macon', null, { as: 'macon', cards: [], mates: masons.filter((x) => x !== id) });
        return;
      }
      case 'voyante':
        for (const id of this.order) if (dealtRole(id) === 'voyante') wake(id, 'voyante', 'seer');
        return;
      case 'voleur':
        for (const id of this.order) if (dealtRole(id) === 'voleur') wake(id, 'voleur', 'rob');
        return;
      case 'noiseuse':
        for (const id of this.order) if (dealtRole(id) === 'noiseuse') wake(id, 'noiseuse', 'swap');
        return;
      case 'soulard':
        for (const id of this.order) if (dealtRole(id) === 'soulard') wake(id, 'soulard', 'drunk');
        return;
      case 'insomniaque':
      case 'doppel-insomniaque':
        for (const id of this.order) {
          const card = this.startHand.get(id)!;
          const wakes = step === 'insomniaque' ? card.role === 'insomniaque' : card.role === 'doppel' && card.copy === 'insomniaque';
          if (wakes) wake(id, 'insomniaque', null, { as: 'insomniaque', cards: [{ place: { player: id }, role: this.hand.get(id)!.role }] });
        }
        return;
    }
  }

  private record(id: string, step: StepId, vision: Vision, auto: boolean): void {
    this.awake.get(id)?.seen.push(vision);
    this.visions.get(id)!.push({ step, vision });
    this.events.push({ step, actor: id, vision, auto });
  }

  /** Les choix possibles pour un geste : utile aux bots et au pilote automatique. */
  otherPlayers(id: string): string[] {
    return this.order.filter((x) => x !== id);
  }

  /** Un geste de nuit. auto : choisi par l'appli (bot, absent, temps écoulé). */
  act(id: string, pick: Pick, auto = false): string | undefined {
    const step = this.currentStep;
    if (!step) return 'Ce n’est pas le moment.';
    const me = this.awake.get(id);
    if (!me || !me.ask) return 'Ce n’est pas à toi d’agir.';
    const players = parsePlayers(pick.players);
    const center = parseCenter(pick.center);
    if (!players || !center) return 'Choix invalide.';
    if (players.some((p) => p === id || !this.has(p))) return 'Choisis la carte d’un autre joueur.';
    const ask = me.ask;
    const vision: Vision = { as: me.as, cards: [] };
    let next: Ask | null = null;
    switch (ask) {
      case 'copy': {
        if (players.length !== 1 || center.length) return 'Touche la carte d’un seul autre joueur.';
        const target = players[0];
        // On regarde la carte telle qu'elle est : personne d'autre n'a encore agi, ce n'est pas la carte Doppelgänger.
        const copied = this.hand.get(target)!.role;
        const mine = this.startHand.get(id)!;
        mine.copy = copied;
        vision.cards.push({ place: { player: target }, role: copied });
        me.as = copied;
        if (copied === 'voyante') next = 'seer';
        else if (copied === 'voleur') next = 'rob';
        else if (copied === 'noiseuse') next = 'swap';
        else if (copied === 'soulard') next = 'drunk';
        this.record(id, step, vision, auto);
        // Copie du Sbire : les Loups-Garous lèvent le pouce tout de suite pour lui.
        if (copied === 'sbire') this.record(id, step, { as: 'sbire', cards: [], mates: this.wakingWolves() }, auto);
        break;
      }
      case 'seer': {
        if (players.length === 1 && !center.length) vision.cards.push({ place: { player: players[0] }, role: this.hand.get(players[0])!.role });
        else if (!players.length && center.length === 2) for (const c of center) vision.cards.push({ place: { center: c }, role: this.center[c].role });
        else return 'Touche la carte d’un joueur, ou deux cartes du centre.';
        this.record(id, step, vision, auto);
        break;
      }
      case 'rob': {
        if (players.length !== 1 || center.length) return 'Touche la carte d’un seul autre joueur.';
        const target = players[0];
        this.swapPlaces({ player: id }, { player: target });
        vision.swap = [{ player: id }, { player: target }];
        vision.cards.push({ place: { player: id }, role: this.hand.get(id)!.role });
        this.record(id, step, vision, auto);
        break;
      }
      case 'swap': {
        if (players.length !== 2 || center.length) return 'Touche les cartes de deux autres joueurs.';
        this.swapPlaces({ player: players[0] }, { player: players[1] });
        vision.swap = [{ player: players[0] }, { player: players[1] }];
        this.record(id, step, vision, auto);
        break;
      }
      case 'drunk': {
        if (players.length || center.length !== 1) return 'Touche une carte du centre.';
        this.swapPlaces({ player: id }, { center: center[0] });
        vision.swap = [{ player: id }, { center: center[0] }];
        this.record(id, step, vision, auto);
        break;
      }
      case 'peek': {
        if (players.length || center.length !== 1) return 'Touche une seule carte du centre.';
        vision.cards.push({ place: { center: center[0] }, role: this.center[center[0]].role });
        this.record(id, step, vision, auto);
        break;
      }
    }
    me.ask = next;
    if (!auto) me.acted = true;
    return undefined;
  }

  private cardAt(p: Place): Card {
    return 'player' in p ? this.hand.get(p.player)! : this.center[p.center];
  }

  private setAt(p: Place, card: Card): void {
    if ('player' in p) this.hand.set(p.player, card);
    else this.center[p.center] = card;
  }

  private swapPlaces(a: Place, b: Place): void {
    const ca = this.cardAt(a);
    const cb = this.cardAt(b);
    this.setAt(a, cb);
    this.setAt(b, ca);
  }

  /** Un choix au hasard pour un geste (pilote automatique, temps écoulé). */
  randomPick(id: string, ask: Ask): Pick {
    const others = shuffle(this.otherPlayers(id), this.rnd);
    const centers = shuffle([0, 1, 2], this.rnd);
    switch (ask) {
      case 'copy':
      case 'rob':
        return { players: [others[0]] };
      case 'swap':
        return { players: others.slice(0, 2) };
      case 'drunk':
      case 'peek':
        return { center: [centers[0]] };
      case 'seer':
        return this.rnd() < 0.5 ? { players: [others[0]] } : { center: centers.slice(0, 2) };
    }
  }

  /** Fin d'étape : les gestes obligatoires que personne n'a faits sont faits au hasard. Regarder reste facultatif. */
  private finishStep(): void {
    for (const [id, a] of this.awake) {
      let guard = 0;
      while (a.ask && MANDATORY.includes(a.ask) && guard++ < 4) {
        const err = this.act(id, this.randomPick(id, a.ask), true);
        if (err) throw new Error(`Geste automatique refusé : ${err}`);
      }
    }
  }

  // ───────────────────────────── Jour ─────────────────────────────

  startDay(): void {
    this.stage = 'day';
    this.awake.clear();
    this.ready.clear();
  }

  setReady(id: string, on: boolean): void {
    if (this.stage !== 'day' || !this.has(id)) return;
    if (on) this.ready.add(id);
    else this.ready.delete(id);
  }

  /** Une annonce : on garde seulement ce qui a un sens pour le rôle annoncé. */
  claim(by: string, raw: Record<string, unknown>): string | undefined {
    if (this.stage !== 'day') return 'On annonce pendant le débat.';
    if (!this.has(by)) return 'Tu regardes la partie : tu joueras à la prochaine.';
    if (this.claims.filter((c) => c.by === by).length >= MAX_CLAIMS_EACH) return 'Tu as déjà beaucoup annoncé : dis le reste à voix haute !';
    const players = parsePlayers(raw.players);
    const center = parseCenter(raw.center);
    if (!players || !center) return 'Annonce invalide.';
    if (players.some((p) => !this.has(p) || p === by)) return 'Annonce invalide.';
    const saw = Array.isArray(raw.saw) ? raw.saw.filter(isRole).slice(0, 2) : [];
    if (saw.some((r) => !this.roles.includes(r))) return 'Ce rôle n’est pas en jeu.';
    const base = { n: this.claims.length + 1, by };
    let claim: Claim;
    if (raw.kind === 'suspect') {
      if (players.length !== 1) return 'Choisis un joueur.';
      claim = { ...base, kind: 'suspect', players };
    } else if (raw.kind === 'noWolf') {
      claim = { ...base, kind: 'noWolf' };
    } else if (raw.kind === 'role') {
      const role = raw.role;
      if (!isRole(role)) return 'Choisis un rôle.';
      if (!this.roles.includes(role)) return 'Ce rôle n’est pas en jeu.';
      claim = { ...base, kind: 'role', role, ...detailFor(role, players, center, saw, raw.alone === true) };
    } else return 'Annonce invalide.';
    this.claims.push(claim);
    return undefined;
  }

  say(by: string, text: unknown): string | undefined {
    if (this.stage !== 'day' && this.stage !== 'vote') return 'On discute pendant le débat.';
    if (!this.has(by)) return 'Tu regardes la partie : tu joueras à la prochaine.';
    const clean = typeof text === 'string' ? text.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    if (!clean) return 'Message vide.';
    this.chat.push({ n: (this.chat[this.chat.length - 1]?.n ?? 0) + 1, by, text: clean });
    if (this.chat.length > MAX_CHAT) this.chat.splice(0, this.chat.length - MAX_CHAT);
    return undefined;
  }

  // ───────────────────────────── Vote ─────────────────────────────

  startVote(): void {
    this.stage = 'vote';
    this.ready.clear();
    this.votes.clear();
    this.autoVotes.clear();
  }

  vote(by: string, target: unknown, auto = false): string | undefined {
    if (this.stage !== 'vote') return 'Le vote n’est pas ouvert.';
    if (!this.has(by)) return 'Tu regardes la partie : tu joueras à la prochaine.';
    if (typeof target !== 'string' || !this.has(target)) return 'Joueur inconnu.';
    if (target === by) return 'On ne peut pas voter pour soi.';
    this.votes.set(by, target);
    this.ready.add(by);
    if (auto) this.autoVotes.add(by);
    else this.autoVotes.delete(by);
    return undefined;
  }

  get allVoted(): boolean {
    return this.order.every((id) => this.votes.has(id));
  }

  /** Les retardataires votent au hasard, puis le vote est résolu. */
  finish(): Outcome {
    for (const id of this.order) {
      if (this.votes.has(id)) continue;
      const others = this.otherPlayers(id);
      this.vote(id, others[Math.floor(this.rnd() * others.length)], true);
    }
    const roleOf: Record<string, Role> = {};
    for (const id of this.order) roleOf[id] = this.roleOf(id);
    this.outcome = resolveVote(this.order, Object.fromEntries(this.votes), roleOf);
    this.stage = 'over';
    return this.outcome;
  }
}

function parsePlayers(x: unknown): string[] | null {
  if (x === undefined) return [];
  if (!Array.isArray(x) || x.length > 3 || x.some((p) => typeof p !== 'string')) return null;
  const list = x as string[];
  return new Set(list).size === list.length ? list : null;
}

function parseCenter(x: unknown): number[] | null {
  if (x === undefined) return [];
  if (!Array.isArray(x) || x.length > 2 || x.some((c) => !Number.isInteger(c) || c < 0 || c >= CENTER)) return null;
  const list = x as number[];
  return new Set(list).size === list.length ? list : null;
}

/** Le détail d'une annonce de rôle : seulement ce qui va avec ce rôle, et seulement s'il est complet. */
function detailFor(role: Role, players: string[], center: number[], saw: Role[], alone: boolean): Partial<Claim> {
  switch (role) {
    case 'voyante':
      if (players.length === 1 && saw.length >= 1) return { players, saw: saw.slice(0, 1) };
      if (center.length === 2 && saw.length === 2) return { center, saw };
      return {};
    case 'voleur':
      return players.length === 1 ? { players, ...(saw.length ? { saw: saw.slice(0, 1) } : {}) } : {};
    case 'noiseuse':
      return players.length === 2 ? { players } : {};
    case 'soulard':
      return center.length === 1 ? { center } : {};
    case 'insomniaque':
      return saw.length ? { saw: saw.slice(0, 1) } : {};
    case 'macon':
      if (alone) return { alone: true };
      return players.length === 1 ? { players } : {};
    case 'doppel':
      return players.length === 1 && saw.length ? { players, saw: saw.slice(0, 1) } : {};
    case 'loup':
      if (alone) return { alone: true, ...(center.length === 1 && saw.length ? { center, saw: saw.slice(0, 1) } : {}) };
      return players.length ? { players: players.slice(0, 2) } : {};
    case 'sbire':
      if (alone) return { alone: true };
      return players.length ? { players } : {};
    default:
      return {};
  }
}
