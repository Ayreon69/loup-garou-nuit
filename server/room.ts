// Une table de Loup-Garou pour une Nuit : salon, partie, nuit chronométrée, débat, vote, bots, pilote automatique et vue de chacun.
// La nuit ne doit rien trahir : chaque étape dure le même temps, même pour un rôle resté au centre, et un geste de nuit
// n'est renvoyé qu'à son auteur. Les bots et les absents agissent au rythme d'une main, jamais à l'instant.
import crypto from 'node:crypto';
import {
  AVATARS,
  BOX,
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROLES,
  isDay,
  isRole,
  isScenario,
  type FinalView,
  type GameView,
  type PlayerStatus,
  type Role,
  type RoomView,
  type Settings,
  type Stage,
} from '../shared/protocol';
import { compositionProblem, countOf, randomComposition, recipeFor, scenarioOf, teamOf } from '../shared/roles';
import { AUTOPILOT, botAccuse, botClaim, botNight, botNoWolf, botVote, randomSkill, type BotInput, type Skill } from './bots';
import { Game, MANDATORY, shuffle } from './game';

const BOT_NAMES = ['Brume', 'Lanterne', 'Ronce', 'Fougère', 'Chardon', 'Silex', 'Givre', 'Mûre', 'Orage', 'Lichen', 'Cendre', 'Myrtille'];
const MAX_MEMBERS = 18;
/** Délai laissé à un joueur déconnecté avant que le pilote automatique ne prenne le relais. */
const GRACE_MS = 20_000;
/** Mode accéléré pour les tests locaux (LN_FAST=1). */
const FAST = process.env.LN_FAST === '1';
const T = {
  deal: FAST ? 1_500 : 75_000,
  dealBotMin: FAST ? 10 : 2_500,
  dealBotSpread: FAST ? 120 : 6_000,
  dusk: FAST ? 250 : 5_500,
  /** Le temps de chaque réveil : « posée » pour une première partie, « normale » ensuite. */
  stepPosee: FAST ? 1_200 : 18_000,
  stepNormale: FAST ? 1_200 : 12_000,
  /** Le Doppelgänger regarde, puis agit peut-être aussitôt : un peu plus long. */
  doppelExtra: FAST ? 400 : 8_000,
  dawn: FAST ? 250 : 4_500,
  /** Dernier appel : un humain qui n'a pas fait son geste obligatoire reçoit un choix au hasard un peu avant la fin, pour voir ce qu'il devient. */
  lastCall: FAST ? 300 : 3_500,
  /** Un bot (ou un absent) agit la nuit après un temps de réflexion, comme une main. */
  nightBotMin: FAST ? 10 : 2_500,
  nightBotSpread: FAST ? 300 : 5_500,
  fastDay: 3_000,
  vote: FAST ? 1_500 : 60_000,
  voteBotMin: FAST ? 10 : 1_800,
  voteBotSpread: FAST ? 250 : 4_500,
  finish: FAST ? 100 : 1_500,
  /** Le débat, côté bots : première annonce, soupçon, prêt à voter. */
  claimMin: FAST ? 20 : 4_000,
  claimSpread: FAST ? 300 : 14_000,
  /** La meute écoute d'abord les autres avant de mentir. */
  liarDelay: FAST ? 200 : 9_000,
  accuseMin: FAST ? 300 : 9_000,
  accuseSpread: FAST ? 400 : 16_000,
  reactMin: FAST ? 50 : 3_500,
  reactSpread: FAST ? 200 : 5_000,
  readyAfterHumans: FAST ? 50 : 1_200,
  readySpread: FAST ? 100 : 2_200,
};
const STAGE_STEP: Record<Stage, number> = { deal: 0, night: 1, day: 2, vote: 3, over: 4 };
const DEFAULT_SETTINGS: Settings = { scenario: 'premiere', custom: [], day: 300, talk: 'oral', pace: 'posee', tips: true };

export interface Player {
  id: string;
  token: string;
  name: string;
  avatar: string;
  isBot: boolean;
  sockets: Set<string>;
  connected: boolean;
  disconnectedAt: number;
  left: boolean;
  status: PlayerStatus;
}

/** Le plan de débat d'un bot. */
interface BotPlan {
  claimAt: number;
  accuseAt: number;
  noWolfAt: number;
  readyAt: number;
  claimed: boolean;
  accused: string[];
}

/** À qui renvoyer l'état après un changement : toute la table (null), ou seulement certains (une liste, vide : personne). */
export type Scope = string[] | null;

function uid(): string {
  return crypto.randomBytes(9).toString('base64url');
}

function rnd(): number {
  return crypto.randomInt(1_000_000) / 1_000_000;
}

export class Room {
  readonly code: string;
  hostId = '';
  phase: 'lobby' | 'playing' | 'finished' = 'lobby';
  settings: Settings = { ...DEFAULT_SETTINGS, custom: [] };
  players: Player[] = [];
  game: Game | null = null;
  final: FinalView | null = null;
  wins = new Map<string, number>();
  skills = new Map<string, Skill>();
  /** Fin de l'étape, du débat ou du vote (heure du serveur) ; 0 : pas de limite. */
  stageEndsAt = 0;
  /** Quand chaque bot (ou absent) agit : distribution, nuit, vote. */
  private actAt = new Map<string, number>();
  private plans = new Map<string, BotPlan>();
  finishAt = 0;
  lastActive = Date.now();
  onChange: () => void = () => {};
  /** Envoie sa vue à un seul joueur (un geste de nuit, un refus : rien ne change chez les autres). */
  onPrivate: (playerId: string) => void = () => {};
  onEmote: (playerId: string, text: string) => void = () => {};

  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(code: string) {
    this.code = code;
  }

  // ───────────────────────────── Membres ─────────────────────────────

  get(id: string | undefined | null): Player | undefined {
    return id ? this.players.find((p) => p.id === id) : undefined;
  }

  findByToken(playerId: unknown, token: unknown): Player | undefined {
    if (typeof playerId !== 'string' || typeof token !== 'string') return undefined;
    const p = this.get(playerId);
    return p && !p.isBot && p.token === token ? p : undefined;
  }

  get seated(): Player[] {
    return this.players.filter((p) => p.status !== 'spectator');
  }

  get humansOnline(): number {
    return this.players.filter((p) => !p.isBot && p.connected).length;
  }

  touch(): void {
    this.lastActive = Date.now();
  }

  private uniqueName(name: string): string {
    const taken = new Set(this.players.map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 99; i++) {
      const candidate = `${name.slice(0, 13)} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return name;
  }

  private makePlayer(name: string, avatar: string, isBot: boolean, status: PlayerStatus): Player {
    return {
      id: uid(),
      token: uid() + uid(),
      name: this.uniqueName(name),
      avatar,
      isBot,
      sockets: new Set(),
      connected: isBot,
      disconnectedAt: Date.now(),
      left: false,
      status,
    };
  }

  addHuman(name: string, avatar: string): Player | string {
    if (this.players.length >= MAX_MEMBERS) return 'Cette table est pleine.';
    if (this.phase === 'lobby' && this.seated.length >= MAX_PLAYERS) return `La table est complète (${MAX_PLAYERS} joueurs maximum).`;
    const p = this.makePlayer(name, avatar, false, this.phase === 'lobby' ? 'lobby' : 'spectator');
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    return p;
  }

  addBot(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut ajouter des bots.";
    if (this.phase !== 'lobby') return 'On ajoute des bots dans le salon.';
    if (this.seated.length >= MAX_PLAYERS) return `La table est complète (${MAX_PLAYERS} joueurs maximum).`;
    const used = new Set(this.players.map((p) => p.name));
    const names = BOT_NAMES.filter((n) => !used.has(n));
    const name = names.length ? names[crypto.randomInt(names.length)] : `Bot ${this.players.length + 1}`;
    const usedAvatars = new Set(this.players.map((p) => p.avatar));
    const free = AVATARS.filter((a) => !usedAvatars.has(a));
    const pool = free.length ? free : AVATARS;
    this.players.push(this.makePlayer(name, pool[crypto.randomInt(pool.length)], true, 'lobby'));
    return undefined;
  }

  kick(by: string, target: string): { sockets: string[] } | string {
    if (by !== this.hostId) return "Seul l'hôte peut retirer un joueur.";
    if (this.phase !== 'lobby') return 'On ne peut retirer un joueur que dans le salon.';
    const p = this.get(target);
    if (!p || p.id === by) return 'Joueur introuvable.';
    this.players = this.players.filter((x) => x.id !== p.id);
    return { sockets: [...p.sockets] };
  }

  leave(id: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.clear();
    p.connected = false;
    p.disconnectedAt = Date.now();
    // En partie, sa place reste à la table : le pilote automatique joue pour lui.
    if (this.phase === 'lobby' || p.status === 'spectator') this.players = this.players.filter((x) => x.id !== id);
    else p.left = true;
    if (this.hostId === id) this.transferHost();
  }

  private transferHost(): void {
    const next = this.players.find((p) => !p.isBot && !p.left && p.connected) ?? this.players.find((p) => !p.isBot && !p.left);
    this.hostId = next?.id ?? '';
  }

  connect(p: Player, socketId: string): void {
    p.sockets.add(socketId);
    p.connected = true;
    p.left = false;
    if (!this.hostId || !this.get(this.hostId) || this.get(this.hostId)?.left) this.hostId = p.id;
  }

  disconnect(id: string | undefined, socketId: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.delete(socketId);
    if (p.sockets.size === 0) {
      p.connected = false;
      p.disconnectedAt = Date.now();
    }
  }

  isAuto(p: Player): boolean {
    return p.isBot || p.left || (!p.connected && Date.now() - p.disconnectedAt >= GRACE_MS);
  }

  updateSettings(by: string, payload: Record<string, unknown>): string | { only: string[] } | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut changer les réglages.";
    if (this.phase !== 'lobby') return 'Les réglages se changent dans le salon.';
    // Tout est vérifié avant de toucher à quoi que ce soit : un réglage refusé ne change rien.
    let custom: Role[] | null = null;
    if (Array.isArray(payload.custom)) {
      custom = payload.custom.filter(isRole).slice(0, MAX_PLAYERS + 3);
      if (ROLES.some((r) => countOf(custom!, r) > BOX[r])) return 'La boîte ne contient pas autant de ces cartes.';
    }
    const s = this.settings;
    const before = JSON.stringify(s);
    if (isScenario(payload.scenario)) s.scenario = payload.scenario;
    if (custom) s.custom = custom;
    if (isDay(payload.day)) s.day = payload.day;
    if (payload.talk === 'oral' || payload.talk === 'ecrit') s.talk = payload.talk;
    if (payload.pace === 'posee' || payload.pace === 'normale') s.pace = payload.pace;
    if (typeof payload.tips === 'boolean') s.tips = payload.tips;
    // Rien n'a changé : inutile de réveiller toute la table.
    return JSON.stringify(s) === before ? { only: [by] } : undefined;
  }

  /** La composition pour n joueurs, ou la raison pour laquelle on ne peut pas lancer. */
  composition(n: number): Role[] | string {
    const s = this.settings;
    if (s.scenario === 'hasard') return randomComposition(n, rnd);
    if (s.scenario === 'mesure') return compositionProblem(s.custom, n) ?? [...s.custom];
    const roles = recipeFor(s.scenario, n);
    if (!roles) {
      const sc = scenarioOf(s.scenario);
      return `« ${sc.name} » se joue de ${sc.min} à ${sc.max} joueurs.`;
    }
    return roles;
  }

  // ───────────────────────────── Partie ─────────────────────────────

  start(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut lancer la partie.";
    if (this.phase !== 'lobby') return 'La partie est déjà lancée.';
    const seated = this.seated;
    if (seated.length < MIN_PLAYERS) return `Il faut au moins ${MIN_PLAYERS} joueurs (ajoute un bot si besoin).`;
    const roles = this.composition(seated.length);
    if (typeof roles === 'string') return roles;
    for (const p of seated) p.status = 'playing';
    const order = shuffle(
      seated.map((p) => p.id),
      rnd,
    );
    const spectators = this.players.filter((p) => p.status === 'spectator');
    this.players = [...order.map((id) => this.get(id)!), ...spectators];
    this.game = new Game(order, roles, rnd);
    this.skills.clear();
    for (const p of this.players) if (p.isBot && p.status === 'playing') this.skills.set(p.id, randomSkill(rnd));
    this.phase = 'playing';
    this.final = null;
    const now = Date.now();
    this.stageEndsAt = now + T.deal;
    this.actAt.clear();
    this.plans.clear();
    for (const id of order) this.actAt.set(id, now + T.dealBotMin + crypto.randomInt(T.dealBotSpread));
    return undefined;
  }

  restart(by: string): string | { only: string[] } | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut relancer une partie.";
    if (this.phase === 'lobby') return { only: [by] };
    this.clearTimer();
    this.players = this.players.filter((p) => !p.left);
    let seats = 0;
    for (const p of this.players) {
      p.status = seats < MAX_PLAYERS ? 'lobby' : 'spectator';
      if (p.status === 'lobby') seats++;
    }
    this.phase = 'lobby';
    this.game = null;
    this.final = null;
    this.skills.clear();
    this.actAt.clear();
    this.plans.clear();
    this.stageEndsAt = 0;
    return undefined;
  }

  endEarly(by: string): string | { only: string[] } | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut arrêter la partie.";
    if (this.phase !== 'playing') return { only: [by] };
    return this.restart(by);
  }

  private playing(by: string): Game | string {
    const g = this.game;
    if (this.phase !== 'playing' || !g) return "Aucune partie n'est en cours.";
    if (!g.has(by)) return 'Tu regardes la partie : tu joueras à la prochaine.';
    return g;
  }

  /** J'ai vu ma carte. */
  seen(by: string): string | { only: string[] } | undefined {
    const g = this.playing(by);
    if (typeof g === 'string') return g;
    if (g.stage !== 'deal' || g.ready.has(by)) return { only: [by] };
    g.markSeen(by);
    if (g.allReady) this.enterNight();
    return undefined;
  }

  private stepMs(): number {
    return this.settings.pace === 'normale' ? T.stepNormale : T.stepPosee;
  }

  private enterNight(): void {
    const g = this.game!;
    g.startNight();
    this.actAt.clear();
    this.stageEndsAt = Date.now() + T.dusk;
  }

  /** L'étape suivante : même durée pour tout le monde, même quand le rôle appelé est au centre. */
  private nextStep(): void {
    const g = this.game!;
    g.nextStep();
    const now = Date.now();
    this.actAt.clear();
    if (g.dawn) {
      this.stageEndsAt = now + T.dawn;
      return;
    }
    const step = g.currentStep!;
    this.stageEndsAt = now + this.stepMs() + (step === 'doppel' ? T.doppelExtra : 0);
    this.scheduleNightBots(now);
  }

  /** Les bots et les absents réveillés agiront dans un moment. */
  private scheduleNightBots(now: number): void {
    const g = this.game!;
    for (const [id, a] of g.awake) {
      const p = this.get(id);
      if (a.ask && p && this.isAuto(p) && !this.actAt.has(id)) this.actAt.set(id, now + T.nightBotMin + crypto.randomInt(T.nightBotSpread));
    }
  }

  private botInput(id: string): BotInput {
    const g = this.game!;
    const card = g.startHand.get(id)!;
    return {
      me: id,
      order: g.order,
      roles: g.roles,
      dealt: card.role,
      copy: card.copy,
      visions: g.visions.get(id) ?? [],
      claims: g.claims,
    };
  }

  private skillOf(id: string): Skill {
    return this.skills.get(id) ?? AUTOPILOT;
  }

  /** Un geste de nuit. Rien ne change chez les autres : seul son auteur reçoit le nouvel état. */
  act(by: string, payload: Record<string, unknown>): string | { only: string[] } {
    const g = this.playing(by);
    if (typeof g === 'string') return g;
    if (payload.step !== g.step) return 'Cette étape est déjà passée.';
    const err = g.act(by, { players: payload.players, center: payload.center });
    if (err) return err;
    return { only: [by] };
  }

  private enterDay(): void {
    const g = this.game!;
    g.startDay();
    const now = Date.now();
    const ms = this.dayMs();
    this.stageEndsAt = ms ? now + ms : 0;
    this.actAt.clear();
    this.plans.clear();
    for (const id of g.order) {
      const p = this.get(id);
      if (!p?.isBot) continue;
      const liar = teamOf(g.dealtAs(id)) !== 'village';
      const claimAt = now + T.claimMin + crypto.randomInt(T.claimSpread) + (liar && this.skillOf(id) !== 'novice' ? T.liarDelay : 0);
      this.plans.set(id, {
        claimAt,
        accuseAt: claimAt + T.accuseMin + crypto.randomInt(T.accuseSpread),
        noWolfAt: claimAt + 1_500 + crypto.randomInt(3_000),
        // Prêts à voter vers les deux tiers du débat ; sans limite, ils attendent les humains.
        readyAt: ms ? now + Math.round(ms * (0.55 + rnd() * 0.25)) : Infinity,
        claimed: false,
        accused: [],
      });
    }
  }

  private dayMs(): number {
    if (FAST) return T.fastDay;
    return this.settings.day * 1000;
  }

  claim(by: string, payload: Record<string, unknown>): string | undefined {
    const g = this.playing(by);
    if (typeof g === 'string') return g;
    const err = g.claim(by, payload);
    if (err) return err;
    this.reactToClaim(by);
    return undefined;
  }

  /** Une annonce peut faire réagir les bots : ils soupçonnent celui qui les contredit. */
  private reactToClaim(by: string): void {
    const now = Date.now();
    for (const [id, plan] of this.plans) {
      if (id === by || !plan.claimed || plan.accused.length >= 2) continue;
      plan.accuseAt = Math.min(plan.accuseAt, now + T.reactMin + crypto.randomInt(T.reactSpread));
    }
  }

  say(by: string, payload: Record<string, unknown>): string | undefined {
    if (this.settings.talk !== 'ecrit') return 'Le débat se fait à voix haute.';
    const g = this.playing(by);
    if (typeof g === 'string') return g;
    return g.say(by, payload.text);
  }

  setReady(by: string, payload: Record<string, unknown>): string | { only: string[] } | undefined {
    const g = this.playing(by);
    if (typeof g === 'string') return g;
    if (g.stage !== 'day' || g.ready.has(by) === (payload.ready === true)) return { only: [by] };
    g.setReady(by, payload.ready === true);
    this.humansReadyNudge();
    this.checkDayEnd();
    return undefined;
  }

  /** Tous les humains sont prêts : les bots ne font pas attendre. */
  private humansReadyNudge(): void {
    const g = this.game!;
    const humansReady = g.order.every((id) => {
      const p = this.get(id);
      return !p || this.isAuto(p) || g.ready.has(id);
    });
    if (!humansReady) return;
    const now = Date.now();
    for (const plan of this.plans.values()) {
      // Les humains sont prêts : les bots qui n'ont rien dit parlent vite, puis se disent prêts à leur tour.
      if (!plan.claimed) plan.claimAt = Math.min(plan.claimAt, now + T.reactMin + crypto.randomInt(T.reactSpread));
      const after = plan.claimed ? now : plan.claimAt;
      plan.readyAt = Math.min(plan.readyAt, after + T.readyAfterHumans + crypto.randomInt(T.readySpread));
    }
  }

  /** L'hôte passe au vote. */
  voteNow(by: string): string | { only: string[] } | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut passer au vote.";
    const g = this.game;
    if (this.phase !== 'playing' || !g || g.stage !== 'day') return { only: [by] };
    this.enterVote();
    return undefined;
  }

  private checkDayEnd(): void {
    const g = this.game!;
    if (g.stage === 'day' && g.allReady) this.enterVote();
  }

  private enterVote(): void {
    const g = this.game!;
    g.startVote();
    const now = Date.now();
    this.stageEndsAt = now + T.vote;
    this.actAt.clear();
    for (const id of g.order) {
      const p = this.get(id);
      if (p && this.isAuto(p)) this.actAt.set(id, now + T.voteBotMin + crypto.randomInt(T.voteBotSpread));
    }
  }

  /** Un vote : changer d'avis ne se voit pas, seul le premier vote allume « a voté ». */
  vote(by: string, payload: Record<string, unknown>): string | { only: string[] } | undefined {
    const g = this.playing(by);
    if (typeof g === 'string') return g;
    const had = g.votes.has(by);
    const err = g.vote(by, payload.target);
    if (err) return err;
    if (g.allVoted) {
      this.enterOver();
      return undefined;
    }
    return had ? { only: [by] } : undefined;
  }

  private enterOver(): void {
    const g = this.game!;
    g.finish();
    this.actAt.clear();
    this.stageEndsAt = 0;
    this.finishAt = Date.now() + T.finish;
  }

  private finishGame(): void {
    const g = this.game;
    if (!g || !g.outcome) return;
    const o = g.outcome;
    for (const id of o.winners) this.wins.set(id, (this.wins.get(id) ?? 0) + 1);
    const votes = new Map<string, number>();
    for (const t of g.votes.values()) votes.set(t, (votes.get(t) ?? 0) + 1);
    this.final = {
      cards: g.cards.map((c) => ({ id: c.id, role: c.role, copy: c.copy })),
      centerStart: g.centerStart.map((c) => c.id),
      centerEnd: g.center.map((c) => c.id),
      players: g.order.map((id, i) => {
        const p = this.get(id);
        const as = g.roleOf(id);
        return {
          id,
          name: p?.name ?? '?',
          avatar: p?.avatar ?? AVATARS[0],
          seat: i + 1,
          startCard: g.startHand.get(id)!.id,
          endCard: g.hand.get(id)!.id,
          as,
          team: teamOf(as),
          vote: g.votes.get(id) ?? null,
          autoVote: g.autoVotes.has(id),
          votes: votes.get(id) ?? 0,
          dead: o.dead.includes(id),
          winner: o.winners.includes(id),
          wins: this.wins.get(id) ?? 0,
        };
      }),
      roles: [...g.roles],
      steps: [...g.steps],
      events: g.events.map((e) => structuredClone(e)),
      claims: g.claims.map((c) => structuredClone(c)),
      outcome: structuredClone(o),
    };
    this.phase = 'finished';
    this.clearTimer();
  }

  // ───────────────────────────── Minuteries ─────────────────────────────

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** À appeler après chaque changement : planifie la prochaine échéance puis diffuse l'état, à tous ou seulement à certains. */
  commit(scope: Scope = null): void {
    this.reschedule();
    if (scope) for (const id of scope) this.onPrivate(id);
    else this.onChange();
  }

  /** La prochaine échéance : fin d'étape, bot qui agit, absent qui passe en pilote automatique, ou fin de partie. */
  private dueAt(): number {
    const g = this.game;
    if (this.phase !== 'playing' || !g) return Infinity;
    if (g.stage === 'over') return this.finishAt;
    let due = this.stageEndsAt || Infinity;
    const now = Date.now();
    for (const [id, at] of this.actAt) {
      const p = this.get(id);
      if (!p || !this.pending(g, id)) continue;
      if (this.isAuto(p)) due = Math.min(due, at);
      else if (!p.connected && !p.left) due = Math.min(due, Math.max(at, p.disconnectedAt + GRACE_MS));
    }
    if (g.stage === 'night') {
      for (const [id, a] of g.awake) {
        const p = this.get(id);
        // Un réveillé qui vient de passer en pilote automatique.
        if (a.ask && p && !p.connected && !p.left && !this.actAt.has(id)) due = Math.min(due, p.disconnectedAt + GRACE_MS);
        // Le dernier appel d'un humain qui n'a pas encore fait son geste obligatoire.
        if (a.ask && MANDATORY.includes(a.ask) && p && !this.isAuto(p) && this.stageEndsAt) due = Math.min(due, this.stageEndsAt - T.lastCall);
      }
    }
    if (g.stage === 'day') {
      for (const plan of this.plans.values()) {
        if (!plan.claimed) due = Math.min(due, plan.claimAt);
        else {
          if (plan.accused.length < 2) due = Math.min(due, plan.accuseAt);
          due = Math.min(due, plan.noWolfAt, plan.readyAt);
        }
      }
      // Un humain absent depuis trop longtemps compte comme prêt.
      for (const id of g.order) {
        const p = this.get(id);
        if (p && !p.isBot && !p.left && !p.connected && !g.ready.has(id)) due = Math.min(due, p.disconnectedAt + GRACE_MS);
      }
    }
    return Math.max(due, now);
  }

  /** Ce joueur a encore un geste à faire dans l'étape en cours. */
  private pending(g: Game, id: string): boolean {
    if (g.stage === 'deal') return !g.ready.has(id);
    if (g.stage === 'night') return !!g.awake.get(id)?.ask;
    if (g.stage === 'vote') return !g.votes.has(id);
    return false;
  }

  private reschedule(): void {
    this.clearTimer();
    const due = this.dueAt();
    if (!Number.isFinite(due)) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      // Une minuterie peut sonner une milliseconde trop tôt : on se rendort, sinon on diffuserait un état inchangé à toute la table.
      if (Date.now() < due) {
        this.reschedule();
        return;
      }
      let scope: Scope = [];
      try {
        scope = this.tick();
      } catch (e) {
        console.error(`[room ${this.code}]`, e);
        scope = null;
      }
      this.commit(scope);
    }, Math.max(0, Math.min(due - Date.now(), 2_147_000_000)));
  }

  /** Fait avancer la table ; renvoie à qui l'état a changé. */
  tick(): Scope {
    const g = this.game;
    if (this.phase !== 'playing' || !g) return [];
    const now = Date.now();
    switch (g.stage) {
      case 'deal': {
        if (this.stageEndsAt && now >= this.stageEndsAt) {
          this.enterNight();
          return null;
        }
        let changed = false;
        for (const [id, at] of this.actAt) {
          const p = this.get(id);
          if (!p || g.ready.has(id) || at > now || !this.isAuto(p)) continue;
          g.markSeen(id);
          changed = true;
        }
        if (g.allReady) {
          this.enterNight();
          return null;
        }
        return changed ? null : [];
      }
      case 'night': {
        if (now >= this.stageEndsAt) {
          if (g.dawn) this.enterDay();
          else this.nextStep();
          return null;
        }
        // Les bots et les absents réveillés agissent : seul l'intéressé le sait.
        const touched: string[] = [];
        this.scheduleNightBots(now);
        for (const [id, at] of this.actAt) {
          const a = g.awake.get(id);
          const p = this.get(id);
          if (!a?.ask || !p || at > now || !this.isAuto(p)) continue;
          const pick = botNight(this.botInput(id), a.ask, this.skillOf(id), rnd);
          const err = g.act(id, pick, !p.isBot);
          if (err) throw new Error(`Geste de nuit refusé : ${err}`);
          // Le Doppelgänger peut avoir un second geste à faire (Voleur, Noiseuse…).
          if (a.ask) this.actAt.set(id, now + T.nightBotMin + crypto.randomInt(T.nightBotSpread));
          else this.actAt.delete(id);
          touched.push(id);
        }
        if (now >= this.stageEndsAt - T.lastCall) {
          for (const [id, a] of g.awake) {
            const p = this.get(id);
            if (!p || this.isAuto(p)) continue;
            let guard = 0;
            while (a.ask && MANDATORY.includes(a.ask) && guard++ < 4) {
              const err = g.act(id, g.randomPick(id, a.ask), true);
              if (err) throw new Error(`Dernier appel refusé : ${err}`);
            }
            if (guard) touched.push(id);
          }
        }
        return touched;
      }
      case 'day': {
        if (this.stageEndsAt && now >= this.stageEndsAt) {
          this.enterVote();
          return null;
        }
        let changed = false;
        for (const [id, plan] of this.plans) {
          const input = () => this.botInput(id);
          const skill = this.skillOf(id);
          if (!plan.claimed && plan.claimAt <= now) {
            plan.claimed = true;
            if (!g.claim(id, botClaim(input(), skill, rnd) as unknown as Record<string, unknown>)) {
              changed = true;
              this.reactToClaim(id);
            }
          }
          if (plan.claimed && plan.accused.length < 2 && plan.accuseAt <= now) {
            const target = botAccuse(input(), skill, rnd, plan.accused);
            plan.accuseAt = target ? now + T.accuseMin + crypto.randomInt(T.accuseSpread) : Infinity;
            if (target && !g.claim(id, { kind: 'suspect', players: [target] })) {
              plan.accused.push(target);
              changed = true;
            }
          }
          if (plan.claimed && plan.noWolfAt <= now) {
            plan.noWolfAt = Infinity;
            if (botNoWolf(input(), skill) && !g.claim(id, { kind: 'noWolf' })) changed = true;
          }
          // Un bot ne se dit prêt qu'après avoir parlé.
          if (plan.claimed && plan.readyAt <= now) {
            plan.readyAt = Infinity;
            if (!g.ready.has(id)) {
              g.setReady(id, true);
              changed = true;
            }
          }
        }
        // Les absents depuis trop longtemps ne bloquent pas le débat.
        for (const id of g.order) {
          const p = this.get(id);
          if (p && !p.isBot && this.isAuto(p) && !g.ready.has(id)) {
            g.setReady(id, true);
            changed = true;
          }
        }
        if (changed) this.humansReadyNudge();
        if (g.allReady) {
          this.enterVote();
          return null;
        }
        return changed ? null : [];
      }
      case 'vote': {
        if (now >= this.stageEndsAt) {
          this.enterOver();
          return null;
        }
        let changed = false;
        for (const [id, at] of [...this.actAt]) {
          const p = this.get(id);
          if (!p || g.votes.has(id) || at > now || !this.isAuto(p)) continue;
          const target = p.isBot ? botVote(this.botInput(id), this.skillOf(id), rnd) : botVote(this.botInput(id), AUTOPILOT, rnd);
          const err = g.vote(id, target, !p.isBot);
          if (err) throw new Error(`Vote automatique refusé : ${err}`);
          this.actAt.delete(id);
          changed = true;
        }
        // Un absent qui vient de passer en pilote automatique votera dans un moment.
        for (const id of g.order) {
          const p = this.get(id);
          if (p && !g.votes.has(id) && !this.actAt.has(id) && this.isAuto(p)) this.actAt.set(id, now + T.voteBotMin + crypto.randomInt(T.voteBotSpread));
        }
        if (g.allVoted) {
          this.enterOver();
          return null;
        }
        return changed ? null : [];
      }
      case 'over':
        if (now >= this.finishAt) {
          this.finishGame();
          return null;
        }
        return [];
    }
  }

  dispose(): void {
    this.clearTimer();
  }

  // ───────────────────────────── Vue personnalisée ─────────────────────────────

  private gameView(g: Game, viewerId: string): GameView {
    const seated = g.has(viewerId);
    const awake = seated && g.stage === 'night' ? g.awake.get(viewerId) : undefined;
    const step = g.currentStep;
    return {
      order: [...g.order],
      stage: g.stage,
      roles: [...g.roles],
      steps: [...g.steps],
      step: g.step,
      endsAt: g.stage === 'over' ? 0 : this.stageEndsAt,
      myCard: seated && g.stage === 'deal' ? g.startHand.get(viewerId)!.role : null,
      night: awake && step ? { step, as: awake.as, ask: awake.ask, seen: awake.seen.map((v) => structuredClone(v)) } : null,
      claims: g.claims.map((c) => structuredClone(c)),
      chat: this.settings.talk === 'ecrit' ? g.chat.map((c) => ({ ...c })) : [],
      myVote: seated && g.stage === 'vote' ? (g.votes.get(viewerId) ?? null) : null,
      // Tiré de ce que tout le monde voit : l'étape et le numéro de réveil.
      seq: STAGE_STEP[g.stage] * 64 + g.step + 2,
    };
  }

  viewFor(viewerId: string): RoomView {
    const g = this.phase === 'playing' ? this.game : null;
    return {
      code: this.code,
      phase: this.phase,
      me: viewerId,
      hostId: this.hostId,
      settings: { ...this.settings, custom: [...this.settings.custom] },
      players: this.players.map((p) => {
        const seat = g ? g.order.indexOf(p.id) : -1;
        return {
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          isBot: p.isBot,
          isHost: p.id === this.hostId,
          connected: p.isBot || p.connected,
          autopilot: !p.isBot && p.status === 'playing' && this.isAuto(p),
          status: p.status,
          wins: this.wins.get(p.id) ?? 0,
          seat: seat >= 0 ? seat + 1 : null,
          ready: !!g && seat >= 0 && (g.stage === 'vote' ? g.votes.has(p.id) : g.stage === 'night' ? false : g.ready.has(p.id)),
        };
      }),
      game: g ? this.gameView(g, viewerId) : null,
      final: this.final,
      serverNow: Date.now(),
    };
  }
}
