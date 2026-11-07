// Contrat partagé entre le serveur et le client : rôles, réglages, vues de table et constantes.
// Les textes des rôles, les scénarios et la résolution du vote sont dans roles.ts.

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 10;
/** Trois cartes restent face cachée au centre de la table. */
export const CENTER = 3;

/** Les douze rôles de la boîte, dans l'ordre du réveil (les dormeurs à la fin). */
export const ROLES = ['doppel', 'loup', 'sbire', 'macon', 'voyante', 'voleur', 'noiseuse', 'soulard', 'insomniaque', 'villageois', 'chasseur', 'tanneur'] as const;
export type Role = (typeof ROLES)[number];

/** Les 16 cartes de la boîte. */
export const BOX: Record<Role, number> = {
  doppel: 1,
  loup: 2,
  sbire: 1,
  macon: 2,
  voyante: 1,
  voleur: 1,
  noiseuse: 1,
  soulard: 1,
  insomniaque: 1,
  villageois: 3,
  chasseur: 1,
  tanneur: 1,
};

/** Le village, la meute (Loups-Garous et Sbire), et le Tanneur qui joue seul. */
export type Team = 'village' | 'meute' | 'tanneur';

/** Les étapes de la nuit, dans l'ordre du livret. Le Doppelgänger-Insomniaque se réveille après la vraie. */
export const STEPS = ['doppel', 'loups', 'sbire', 'macons', 'voyante', 'voleur', 'noiseuse', 'soulard', 'insomniaque', 'doppel-insomniaque'] as const;
export type StepId = (typeof STEPS)[number];

/**
 * Ce qu'on attend d'un joueur réveillé.
 * copy : (Doppelgänger) regarder la carte d'un autre joueur et en copier le rôle.
 * seer : regarder la carte d'un autre joueur, ou deux cartes du centre.
 * rob : échanger sa carte avec celle d'un autre joueur, puis la regarder.
 * swap : échanger les cartes de deux autres joueurs, sans les regarder.
 * drunk : échanger sa carte avec une carte du centre, sans la regarder.
 * peek : (Loup-Garou seul) regarder une carte du centre, si on le souhaite.
 */
export type Ask = 'copy' | 'seer' | 'rob' | 'swap' | 'drunk' | 'peek';

/** Un emplacement de carte : devant un joueur, ou au centre (0 à gauche, 1 au milieu, 2 à droite). */
export type Place = { player: string } | { center: number };

/** Une carte vue pendant la nuit, telle qu'elle est imprimée : la carte Doppelgänger ne montre pas le rôle copié. */
export interface SeenCard {
  place: Place;
  role: Role;
}

/** Ce qu'un joueur réveillé apprend ou fait pendant une étape. */
export interface Vision {
  /** Le rôle sous lequel il agit (copie du Doppelgänger comprise). */
  as: Role;
  /** Cartes regardées. */
  cards: SeenCard[];
  /** Joueurs vus les yeux ouverts (Loups-Garous, Francs-Maçons) ou le pouce levé (pour le Sbire). */
  mates?: string[];
  /** Échange fait : les deux emplacements. */
  swap?: [Place, Place];
}

export type DaySetting = 180 | 300 | 600 | 0;
export const DAY_TIMERS: readonly DaySetting[] = [180, 300, 600, 0];

export type Talk = 'oral' | 'ecrit';
export type Pace = 'posee' | 'normale';

export const SCENARIO_IDS = ['premiere', 'solitaire', 'blanche', 'fusil', 'tanneur', 'confusion', 'complices', 'alliance', 'double', 'hasard', 'mesure'] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];

export interface Settings {
  scenario: ScenarioId;
  /** Les cartes choisies une à une (scénario « Sur mesure »). */
  custom: Role[];
  /** Durée du débat, en secondes ; 0 : sans limite. */
  day: DaySetting;
  /** Débat à voix haute (par défaut) ou par écrit, avec un fil de discussion. */
  talk: Talk;
  /** Le temps laissé à chaque rôle réveillé. */
  pace: Pace;
  /** Des conseils pour débutants à chaque étape. */
  tips: boolean;
}

export const AVATARS = ['lune', 'chouette', 'renard', 'chat', 'cerf', 'herisson', 'lapin', 'sanglier', 'ours', 'chauvesouris', 'grenouille', 'champignon'] as const;
export const EMOTES = ['👀', '🤔', '😱', '🐺', '🤥', '😇'] as const;

export type PlayerStatus = 'lobby' | 'playing' | 'spectator';

export interface PlayerView {
  id: string;
  name: string;
  avatar: string;
  isBot: boolean;
  isHost: boolean;
  connected: boolean;
  autopilot: boolean;
  status: PlayerStatus;
  /** Parties gagnées à cette table. */
  wins: number;
  /** Sa place autour de la table (1 à 10), null hors partie. */
  seat: number | null;
  /** Distribution : a vu sa carte. Jour : prêt à voter. Vote : a voté (pas pour qui). */
  ready: boolean;
}

/**
 * deal : chacun découvre sa carte.
 * night : la nuit, étape par étape (step vaut -1 quand la nuit tombe, steps.length quand le jour se lève).
 * day : le débat.
 * vote : chacun désigne un joueur en secret.
 * over : les votes sont faits, le dévoilement arrive.
 */
export type Stage = 'deal' | 'night' | 'day' | 'vote' | 'over';

export type ClaimKind = 'role' | 'suspect' | 'noWolf';

/** Une annonce faite à toute la table. Rien n'oblige à dire la vérité. */
export interface Claim {
  n: number;
  by: string;
  kind: ClaimKind;
  /** Le rôle annoncé. */
  role?: Role;
  /** Voyante : le joueur regardé. Voleur : le joueur volé. Noiseuse : les deux joueurs échangés. Doppelgänger : le joueur copié. Franc-Maçon : l'autre. Soupçon : le suspect. */
  players?: string[];
  /** Voyante : les deux cartes du centre. Soûlard : la carte prise. Loup-Garou seul : la carte regardée. */
  center?: number[];
  /** Ce qu'on dit avoir vu : la ou les cartes de la Voyante, la carte volée, la carte de l'Insomniaque au réveil, le rôle copié… */
  saw?: Role[];
  /** Franc-Maçon : seul réveillé (l'autre carte est au centre). */
  alone?: boolean;
}

export interface ChatLine {
  n: number;
  by: string;
  text: string;
}

/** Mon réveil pendant l'étape de nuit en cours : ce qu'on attend de moi et ce que j'ai vu. */
export interface MyNight {
  step: StepId;
  as: Role;
  /** Ce qu'on attend encore de moi ; null si rien (ou si c'est fait). */
  ask: Ask | null;
  /** Ce que j'ai vu ou fait pendant cette étape, seulement. Au matin, il faut s'en souvenir : rien n'est gardé. */
  seen: Vision[];
}

export interface GameView {
  order: string[];
  stage: Stage;
  /** Les rôles en jeu, centre compris, dans l'ordre du réveil : c'est public, comme à une vraie table. */
  roles: Role[];
  steps: StepId[];
  step: number;
  /** Heure du serveur : fin de l'étape, du débat ou du vote (0 : pas de limite). */
  endsAt: number;
  /** Pendant la distribution seulement : ma carte. Ensuite, comme à une vraie table, on ne la regarde plus. */
  myCard: Role | null;
  /** Mon réveil, pendant l'étape où je me réveille. */
  night: MyNight | null;
  claims: Claim[];
  chat: ChatLine[];
  /** Mon vote, tant que le vote dure. */
  myVote: string | null;
  /** Numéro de l'état, tiré de ce qui est public : un geste envoyé pour un état passé est ignoré. */
  seq: number;
}

/** Une carte de la partie : son rôle, et pour le Doppelgänger le rôle copié. */
export interface CardView {
  id: number;
  role: Role;
  copy: Role | null;
}

/** Un réveil de la nuit, pour le récit du matin. */
export interface NightEvent {
  step: StepId;
  actor: string;
  vision: Vision;
  /** Choisi par l'appli, faute de geste à temps. */
  auto: boolean;
}

export interface FinalPlayer {
  id: string;
  name: string;
  avatar: string;
  seat: number;
  /** La carte reçue au début. */
  startCard: number;
  /** La carte devant lui à la fin. */
  endCard: number;
  /** Son rôle à la fin (la copie, pour la carte Doppelgänger). */
  as: Role;
  team: Team;
  vote: string | null;
  autoVote: boolean;
  votes: number;
  dead: boolean;
  winner: boolean;
  wins: number;
}

export interface FinalView {
  cards: CardView[];
  /** Les cartes du centre, au début et à la fin. */
  centerStart: number[];
  centerEnd: number[];
  players: FinalPlayer[];
  roles: Role[];
  steps: StepId[];
  events: NightEvent[];
  claims: Claim[];
  outcome: Outcome;
}

/** Ce que décide le vote. */
export interface Outcome {
  /** Chacun a reçu exactement une voix : personne ne meurt. */
  noDeath: boolean;
  /** Éliminés par le vote. */
  killed: string[];
  /** Les tirs du Chasseur, dans l'ordre. */
  shots: { by: string; target: string }[];
  dead: string[];
  /** Les Loups-Garous parmi les joueurs à la fin. */
  wolves: string[];
  village: boolean;
  meute: boolean;
  /** Chaque joueur gagnant. */
  winners: string[];
}

export interface RoomView {
  code: string;
  phase: 'lobby' | 'playing' | 'finished';
  me: string;
  hostId: string;
  settings: Settings;
  players: PlayerView[];
  game: GameView | null;
  final: FinalView | null;
  serverNow: number;
}

export type Ack<T = unknown> = (res: { ok: boolean; error?: string; data?: T }) => void;

export function isRole(x: unknown): x is Role {
  return typeof x === 'string' && (ROLES as readonly string[]).includes(x);
}

export function isScenario(x: unknown): x is ScenarioId {
  return typeof x === 'string' && (SCENARIO_IDS as readonly string[]).includes(x);
}

export function isDay(x: unknown): x is DaySetting {
  return typeof x === 'number' && (DAY_TIMERS as readonly number[]).includes(x);
}

export function samePlace(a: Place, b: Place): boolean {
  if ('player' in a) return 'player' in b && a.player === b.player;
  return 'center' in b && a.center === b.center;
}
