// Test de bout en bout de « Loup-Garou pour une Nuit », sur le serveur compilé, en mode accéléré (LN_FAST=1 :
// distribution 1,5 s, réveils de 1,2 s, débat de 3 s, vote de 1,5 s ; voir T dans server/room.ts).
// Partie 1 : 3 humains (socket.io) + 2 bots, réglages par défaut, débat à voix haute. Une spectatrice arrive pendant la
//   distribution, un joueur se déconnecte la nuit puis reprend sa session, une session volée est refusée, et les gestes
//   interdits sont refusés sans rien diffuser aux autres.
// Partie 2 : revanche à 10, la table pleine (la spectatrice s'assoit, des bots complètent), débat par écrit, l'hôte passe
//   au vote ; un retardataire, refusé au salon complet, arrive en spectateur.
// Partie 3 : composition sur mesure à 5 (Doppelgänger, Loup-Garou seul, Sbire, Soûlard, Tanneur, Chasseur…).
// Partie 4 : cartes tirées au hasard, à 6 (le spectateur s'assoit à son tour).
// Partie 5 : rien que des humains, chacun vote pour son voisin de gauche : une voix chacun, personne ne meurt.
// Partie 6 : arrêtée par l'hôte pendant la distribution.
// Les humains regardent leur carte, agissent quand ils sont réveillés, annoncent, se disent prêts et votent (et changent
// parfois d'avis). À chaque état reçu par chaque client, on vérifie qu'aucune information cachée ne fuit ; à la fin de
// chaque partie, on rejoue la nuit (échanges, visions) et le vote selon les règles, recopiées ici, et on compare au
// dévoilement. Usage : npm run build && npm run e2e
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3900 + Math.floor(Math.random() * 900);
const ADDRESS = `http://localhost:${PORT}`;
const started = Date.now();
let over = false;
const server = spawn(process.execPath, ['dist/server/index.mjs'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), LN_FAST: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
function fail(msg) {
  if (over) return;
  over = true;
  console.error(`✗ ${msg}`);
  server.kill();
  process.exit(1);
}
const serverErrors = [];
server.stderr.on('data', (d) => {
  process.stderr.write(d);
  serverErrors.push(String(d));
});
server.on('exit', (code) => fail(`le serveur s'est arrêté (code ${code})`));
setTimeout(() => fail('délai dépassé (5 min)'), 300_000).unref();

await new Promise((resolve) => {
  let out = '';
  server.stdout.on('data', (d) => {
    out += d;
    if (out.includes('prêt')) resolve();
  });
});

// ───────────────────────────── Les règles, recopiées pour ne pas dépendre du code testé ─────────────────────────────

const MAX_PLAYERS = 10;
const CENTER = 3;
const ROLES = ['doppel', 'loup', 'sbire', 'macon', 'voyante', 'voleur', 'noiseuse', 'soulard', 'insomniaque', 'villageois', 'chasseur', 'tanneur'];
const BOX = { doppel: 1, loup: 2, sbire: 1, macon: 2, voyante: 1, voleur: 1, noiseuse: 1, soulard: 1, insomniaque: 1, villageois: 3, chasseur: 1, tanneur: 1 };
const STEPS = ['doppel', 'loups', 'sbire', 'macons', 'voyante', 'voleur', 'noiseuse', 'soulard', 'insomniaque', 'doppel-insomniaque'];
const STAGES = ['deal', 'night', 'day', 'vote', 'over'];
const ASKS = ['copy', 'seer', 'rob', 'swap', 'drunk', 'peek'];
/** Les gestes de nuit (les autres visions viennent toutes seules au réveil). */
const ACTS = new Set(ASKS);
/** Les durées du mode accéléré (server/room.ts) : la nuit ne finit jamais une étape plus tôt, quoi qu'on y fasse. */
const FAST = { step: 1200, doppelExtra: 400, dawn: 250 };
const DEFAULT_SETTINGS = { scenario: 'premiere', custom: [], day: 300, talk: 'oral', pace: 'posee', tips: true };
/** « Première nuit » à 5 et à 10 joueurs. */
const PREMIERE = {
  5: ['loup', 'loup', 'voyante', 'voleur', 'noiseuse', 'villageois', 'villageois', 'villageois'],
  10: ['loup', 'loup', 'macon', 'macon', 'voyante', 'voleur', 'noiseuse', 'soulard', 'insomniaque', 'villageois', 'villageois', 'villageois', 'chasseur'],
};
/** La composition sur mesure de la partie 3 (5 joueurs + 3 au centre). */
const CUSTOM = ['doppel', 'loup', 'sbire', 'voleur', 'soulard', 'insomniaque', 'tanneur', 'chasseur'];

const sortRoles = (roles) => [...roles].sort((a, b) => ROLES.indexOf(a) - ROLES.indexOf(b));
const countOf = (arr, x) => arr.filter((y) => y === x).length;
const effective = (card) => (card.role === 'doppel' ? (card.copy ?? 'doppel') : card.role);
const teamOf = (role) => (role === 'loup' || role === 'sbire' ? 'meute' : role === 'tanneur' ? 'tanneur' : 'village');

/** Tous les rôles en jeu sont appelés, même ceux restés au centre, pour ne rien trahir. */
function nightSteps(roles) {
  return STEPS.filter((s) => {
    if (s === 'loups') return roles.includes('loup');
    if (s === 'macons') return roles.includes('macon');
    if (s === 'doppel-insomniaque') return roles.includes('doppel') && roles.includes('insomniaque');
    return roles.includes(s);
  });
}

/** Qui se réveille à une étape, d'après la carte reçue (et le rôle copié par le Doppelgänger). */
function wakes(step, card) {
  const as = effective(card);
  if (step === 'doppel') return card.role === 'doppel';
  if (step === 'loups') return as === 'loup';
  if (step === 'macons') return as === 'macon';
  if (step === 'doppel-insomniaque') return card.role === 'doppel' && card.copy === 'insomniaque';
  return card.role === step;
}

/** Les réveils possibles à une étape, vision par vision. Copier, voler, échanger, prendre au centre : obligatoire. */
function allowedKinds(step, card) {
  switch (step) {
    case 'doppel': {
      if (!card.copy) return [['copy']];
      const then = { voyante: [[], ['seer']], voleur: [['rob']], noiseuse: [['swap']], soulard: [['drunk']], sbire: [['mates']] }[card.copy] ?? [[]];
      return then.map((t) => ['copy', ...t]);
    }
    case 'loups':
      return [['mates'], ['mates', 'peek']];
    case 'sbire':
    case 'macons':
      return [['mates']];
    case 'voyante':
      return [[], ['seer']];
    case 'voleur':
      return [['rob']];
    case 'noiseuse':
      return [['swap']];
    case 'soulard':
      return [['drunk']];
    default:
      return [['self']];
  }
}
/** Le rôle sous lequel on se réveille à chaque étape (le Doppelgänger : la copie, une fois faite). */
const AS_AT = { loups: 'loup', sbire: 'sbire', macons: 'macon', insomniaque: 'insomniaque', 'doppel-insomniaque': 'insomniaque' };

/**
 * Le vote : le plus de voix meurt, tous les ex æquo à égalité ; si chacun a exactement une voix, personne ne meurt.
 * Un Chasseur qui meurt emporte celui qu'il a désigné. Le village gagne si un Loup-Garou meurt ; sans Loup-Garou parmi les
 * joueurs, s'il ne meurt personne du village ni le Tanneur. La meute gagne si aucun Loup-Garou ni le Tanneur ne meurt ;
 * sans Loup-Garou, le Sbire gagne s'il survit et qu'un joueur du village meurt (pas le Tanneur). Le Tanneur gagne s'il meurt.
 */
function resolve(order, votes, roleOf) {
  const counts = new Map(order.map((id) => [id, 0]));
  for (const id of order) counts.set(votes[id], counts.get(votes[id]) + 1);
  const max = Math.max(...counts.values());
  const noDeath = max <= 1;
  const killed = noDeath ? [] : order.filter((id) => counts.get(id) === max);
  const dead = [...killed];
  const shots = [];
  for (let i = 0; i < dead.length; i++) {
    const id = dead[i];
    if (roleOf[id] === 'chasseur' && !dead.includes(votes[id])) {
      shots.push({ by: id, target: votes[id] });
      dead.push(votes[id]);
    }
  }
  const isDead = (id) => dead.includes(id);
  const wolves = order.filter((id) => roleOf[id] === 'loup');
  const wolfDead = wolves.some(isDead);
  const tannerDead = dead.some((id) => roleOf[id] === 'tanneur');
  const villagerDead = dead.some((id) => teamOf(roleOf[id]) === 'village');
  const village = wolves.length ? wolfDead : !villagerDead && !tannerDead;
  const winners = order.filter((id) => {
    const role = roleOf[id];
    if (role === 'tanneur') return isDead(id);
    if (teamOf(role) === 'village') return village;
    if (wolves.length) return !wolfDead && !tannerDead;
    return role === 'sbire' && !isDead(id) && villagerDead && !tannerDead;
  });
  const meute = winners.some((id) => teamOf(roleOf[id]) === 'meute');
  return { noDeath, killed, shots, dead, wolves, village, meute, winners };
}

// ───────────────────────────── Ce qui ne doit jamais sortir du serveur ─────────────────────────────

const ROOM_KEYS = 'code,final,game,hostId,me,phase,players,serverNow,settings';
const SETTINGS_KEYS = 'custom,day,pace,scenario,talk,tips';
const PLAYER_KEYS = 'autopilot,avatar,connected,id,isBot,isHost,name,ready,seat,status,wins';
const GAME_KEYS = 'chat,claims,endsAt,myCard,myVote,night,order,roles,seq,stage,step,steps';
const NIGHT_KEYS = 'as,ask,seen,step';
const FINAL_KEYS = 'cards,centerEnd,centerStart,claims,events,outcome,players,roles,steps';
const FINAL_PLAYER_KEYS = 'as,autoVote,avatar,dead,endCard,id,name,seat,startCard,team,vote,votes,winner,wins';
const OUTCOME_KEYS = 'dead,killed,meute,noDeath,shots,village,winners,wolves';
const EVENT_KEYS = 'actor,auto,step,vision';
const CLAIM_KEYS = new Set(['n', 'by', 'kind', 'role', 'players', 'center', 'saw', 'alone']);
const VISION_KEYS = new Set(['as', 'cards', 'mates', 'swap']);
/** Champs du serveur seulement : jetons, niveau des bots, minuteries, visions de chacun, mains, votes… (des clés, sauf les niveaux des bots). */
const SECRET = ['"token":', '"skill', '"novice"', '"habile"', '"retors"', '"actAt":', '"plans":', '"visions":', '"startHand":', '"hand":', '"awake":', '"acted":', '"autoVotes":', '"sockets":', '"disconnectedAt":', '"lastActive":', '"stageEndsAt":', '"finishAt":', '"claimAt":', '"accuseAt":', '"noWolfAt":', '"readyAt":', '"accused":', '"dealt":'];
/** Seulement au dévoilement (des clés : « copy » est aussi le geste demandé au Doppelgänger). */
const FINAL_ONLY = ['"startCard":', '"endCard":', '"centerStart":', '"centerEnd":', '"outcome":', '"events":', '"winners":', '"wolves":', '"killed":', '"shots":', '"copy":', '"team":', '"autoVote":', '"dead":', '"votes":', '"auto":'];
/** Seulement pour un joueur réveillé, pendant son étape (ou au dévoilement). */
const AWAKE_ONLY = ['"cards":', '"mates":', '"swap":', '"place":', '"seen":'];

const keysOf = (o) => (o && typeof o === 'object' ? Object.keys(o).sort().join(',') : String(o));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const startsWith = (seq, path) => path.length <= seq.length && path.every((k, i) => seq[i] === k);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
const rand = (a, b) => a + Math.random() * (b - a);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const stats = {
  states: 0,
  refused: 0,
  quiet: 0,
  seen: 0,
  dealIdle: 0,
  acts: 0,
  nightIdle: 0,
  nightLate: 0,
  claims: 0,
  says: 0,
  ready: 0,
  readyToggles: 0,
  voteNow: 0,
  votes: 0,
  changes: 0,
  lateVotes: 0,
  events: 0,
  visions: 0,
  resumes: 0,
};
const results = [];
const tokens = new Set();
/** La partie en cours, côté test : son nom, ce que font les humains, et qui est assis. */
let current = null;

// ───────────────────────────── Les clients ─────────────────────────────

const newMem = () => ({
  dealt: null,
  copy: null,
  once: new Set(),
  sent: new Set(),
  acts: [],
  seen: new Map(),
  awake: new Map(),
  claims: [],
  says: [],
  votes: [],
  dayDone: false,
  lateVoter: false,
});

function client(name, { player = true, avatar = 'lune' } = {}) {
  const socket = io(ADDRESS, { transports: ['websocket'], forceNew: true });
  const c = { name, avatar, socket, player, view: null, lastGame: null, session: null, count: 0, emotes: [], lastGesture: 0, inflight: 0, offline: false, mem: newMem() };
  socket.on('state', (v) => {
    if (over) return;
    c.count++;
    const prev = c.view;
    c.view = v;
    audit(c, prev, v);
    if (v.game) c.lastGame = v.game;
    if (c.player) play(c);
  });
  socket.on('emote', (e) => c.emotes.push(e));
  socket.on('disconnect', () => {
    c.view = null;
  });
  c.call = (event, payload = {}) => new Promise((res) => socket.emit(event, payload, res));
  c.reset = () => {
    c.mem = newMem();
  };
  return c;
}
const connected = (c) => (c.socket.connected ? Promise.resolve() : new Promise((r) => c.socket.once('connect', r)));

/** Un client coupé ne fait plus rien : ses gestes prévus s'arrêtent là. */
class Offline extends Error {}

async function gesture(c, event, payload = {}) {
  if (c.offline) throw new Offline();
  c.inflight++;
  c.lastGesture = Date.now();
  try {
    return await c.call(event, payload);
  } finally {
    c.inflight--;
    c.lastGesture = Date.now();
  }
}
async function accept(c, event, payload, what) {
  const res = await gesture(c, event, payload);
  if (!res?.ok) fail(`${c.name} : ${what} refusé (${res?.error})`);
  return res;
}
async function refuse(c, event, payload, what, reason) {
  const res = await gesture(c, event, payload);
  if (res?.ok) fail(`${c.name} : ${what} accepté`);
  if (reason && !reason.test(res?.error ?? '')) fail(`${c.name} : ${what} refusé pour une autre raison (${res?.error})`);
  stats.refused++;
}
function later(c, ms, fn) {
  setTimeout(() => {
    if (c.offline || over) return;
    fn().catch((e) => {
      if (!(e instanceof Offline)) fail(`${c.name} : ${e?.stack ?? e}`);
    });
  }, ms);
}
function waitFor(what, cond, ms = 20_000) {
  const test = () => {
    try {
      return cond();
    } catch {
      return false;
    }
  };
  return new Promise((resolve) => {
    if (test()) return resolve();
    const start = Date.now();
    const timer = setInterval(() => {
      if (test()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - start > ms) {
        clearInterval(timer);
        fail(`attente trop longue : ${what}`);
      }
    }, 10);
  });
}
/** Un geste refusé ne réveille personne : les observateurs ne reçoivent aucun état (ni réaction) dans les 150 ms. */
async function quiet(observers, what, fn) {
  const counts = observers.map((o) => o.count);
  const emotes = observers.map((o) => o.emotes.length);
  await fn();
  await pause(150);
  observers.forEach((o, i) => {
    if (o.count !== counts[i]) fail(`${what} : ${o.name} a reçu ${o.count - counts[i]} état(s) ; un geste refusé a été diffusé`);
    if (o.emotes.length !== emotes[i]) fail(`${what} : ${o.name} a reçu une réaction`);
  });
  stats.quiet++;
}
const seatedCount = (v) => v.players.filter((p) => p.status !== 'spectator').length;
const winsOf = (v) => new Map(v.players.map((p) => [p.id, p.wins]));

// ───────────────────────────── L'audit de chaque état reçu ─────────────────────────────

/** Ce que tout le monde voit : la vue sans ce qui n'appartient qu'à soi ni l'heure du serveur. */
const publicPart = (v) => JSON.stringify({ ...v, serverNow: 0, game: v.game ? { ...v.game, myCard: null, night: null, myVote: null } : null });

function audit(c, prev, v) {
  stats.states++;
  const who = c.name;
  const json = JSON.stringify(v);
  for (const w of SECRET) if (json.includes(w)) fail(`la vue de ${who} contient ${w}`);
  for (const t of tokens) if (json.includes(t)) fail(`la vue de ${who} contient un jeton de session`);
  if (!v.final) for (const w of FINAL_ONLY) if (json.includes(w)) fail(`la vue de ${who} contient ${w} avant le dévoilement`);
  if (!v.final && !v.game?.night) for (const w of AWAKE_ONLY) if (json.includes(w)) fail(`la vue de ${who} contient ${w} sans qu'il soit réveillé`);
  if (keysOf(v) !== ROOM_KEYS) fail(`la vue de ${who} contient ${keysOf(v)}`);
  if (keysOf(v.settings) !== SETTINGS_KEYS) fail(`réglages vus par ${who} : ${keysOf(v.settings)}`);
  if (c.session && v.me !== c.session.playerId) fail(`${who} reçoit la vue d'un autre joueur`);
  if (typeof v.serverNow !== 'number') fail('heure du serveur absente');
  const hosts = v.players.filter((p) => p.isHost);
  if (hosts.length !== 1 || hosts[0].id !== v.hostId) fail(`hôte mal marqué pour ${who}`);
  for (const p of v.players) {
    if (keysOf(p) !== PLAYER_KEYS) fail(`un joueur vu par ${who} contient ${keysOf(p)}`);
    if (p.isBot && !p.connected) fail(`le bot ${p.name} paraît déconnecté`);
    if (p.autopilot) fail(`${p.name} est passé en pilote automatique`);
    if (!Number.isInteger(p.wins) || p.wins < 0) fail(`victoires de ${p.name} : ${p.wins}`);
  }
  const g = v.game;
  if ((v.phase === 'playing') !== !!g) fail(`partie ${g ? 'visible' : 'absente'} en phase ${v.phase}`);
  if ((v.phase === 'finished') !== !!v.final) fail(`dévoilement ${v.final ? 'visible' : 'absent'} en phase ${v.phase}`);
  if (v.phase !== 'playing') {
    for (const p of v.players) if (p.seat !== null || p.ready) fail(`${p.name} a une place ou est « prêt » hors partie`);
    if (v.phase === 'lobby') {
      if (seatedCount(v) > MAX_PLAYERS) fail(`${seatedCount(v)} joueurs assis au salon`);
      if (v.players.some((p) => p.status === 'playing')) fail('un joueur « en partie » au salon');
    }
    if (v.final && keysOf(v.final) !== FINAL_KEYS) fail(`dévoilement : ${keysOf(v.final)}`);
    return;
  }
  auditGame(c, prev, v, g);
}

function auditGame(c, prev, v, g) {
  const who = c.name;
  const me = v.me;
  if (keysOf(g) !== GAME_KEYS) fail(`la partie vue par ${who} contient ${keysOf(g)}`);
  const n = g.order.length;
  const seated = g.order.includes(me);
  if (n < 3 || n > MAX_PLAYERS || new Set(g.order).size !== n) fail(`table de ${n} joueurs`);
  for (const p of v.players) {
    const i = g.order.indexOf(p.id);
    if (i >= 0 ? p.seat !== i + 1 || p.status !== 'playing' : p.seat !== null || p.status !== 'spectator') fail(`place de ${p.name} incohérente (${p.status}, ${p.seat})`);
    if (i < 0 && p.ready) fail(`le spectateur ${p.name} est « prêt »`);
    if (g.stage === 'night' && p.ready) fail(`${p.name} paraît « prêt » pendant la nuit`);
  }
  if (g.order.some((id) => !v.players.some((p) => p.id === id))) fail('un joueur de la partie a disparu de la table');
  // Les rôles en jeu sont publics, comme à une vraie table ; les étapes en découlent toutes.
  if (g.roles.length !== n + CENTER || !same(g.roles, sortRoles(g.roles))) fail(`rôles en jeu : ${g.roles}`);
  for (const r of g.roles) if (!ROLES.includes(r) || countOf(g.roles, r) > BOX[r]) fail(`rôle ${r} impossible`);
  if (!g.roles.includes('loup')) fail('aucun Loup-Garou en jeu');
  if (!same(g.steps, nightSteps(g.roles))) fail(`étapes de la nuit : ${g.steps}`);
  const si = STAGES.indexOf(g.stage);
  if (si < 0) fail(`étape inconnue : ${g.stage}`);
  const stepOk = g.stage === 'deal' ? g.step === -1 : g.stage === 'night' ? g.step >= -1 && g.step <= g.steps.length : g.step === g.steps.length;
  if (!stepOk) fail(`réveil ${g.step} pendant ${g.stage}`);
  if (g.seq !== si * 64 + g.step + 2) fail(`numéro d'état ${g.seq} pendant ${g.stage}/${g.step}`);
  if (g.stage === 'over' ? g.endsAt !== 0 : !(g.endsAt > 0)) fail(`échéance ${g.endsAt} pendant ${g.stage}`);

  // Ce qui n'appartient qu'à soi.
  if (g.myCard !== null && !(seated && g.stage === 'deal')) fail(`${who} voit une carte pendant ${g.stage}${seated ? '' : ' sans être assis'}`);
  if (seated && g.stage === 'deal' && !g.roles.includes(g.myCard)) fail(`${who} ne voit pas sa carte à la distribution`);
  if (g.myVote !== null && !(seated && g.stage === 'vote')) fail(`${who} voit un vote pendant ${g.stage}`);
  if (g.myVote !== null && (!g.order.includes(g.myVote) || g.myVote === me)) fail(`${who} a voté pour ${g.myVote}`);
  if (seated && g.stage === 'vote' && v.players.find((p) => p.id === me).ready !== (g.myVote !== null)) fail(`${who} : « a voté » ne suit pas son vote`);
  if (g.night && !(seated && g.stage === 'night' && g.step >= 0 && g.step < g.steps.length)) fail(`${who} se voit réveillé pendant ${g.stage}/${g.step}`);

  // Annonces et fil de discussion : publics, seulement le jour, et seulement par écrit pour le fil.
  if ((g.stage === 'deal' || g.stage === 'night') && (g.claims.length || g.chat.length)) fail(`annonces ou messages pendant ${g.stage}`);
  if (v.settings.talk === 'oral' && g.chat.length) fail('un fil de discussion en débat à voix haute');
  g.claims.forEach((cl, i) => {
    if (cl.n !== i + 1 || !g.order.includes(cl.by) || !['role', 'suspect', 'noWolf'].includes(cl.kind)) fail(`annonce invalide : ${JSON.stringify(cl)}`);
    for (const k of Object.keys(cl)) if (!CLAIM_KEYS.has(k)) fail(`annonce avec ${k}`);
    if (cl.role !== undefined && !g.roles.includes(cl.role)) fail(`annonce d'un rôle hors jeu : ${cl.role}`);
  });
  for (const line of g.chat) if (keysOf(line) !== 'by,n,text' || !g.order.includes(line.by) || typeof line.text !== 'string' || !line.text || line.text.length > 200) fail(`message invalide : ${JSON.stringify(line)}`);

  // La suite de l'état précédent, dans la même partie.
  const pg = prev?.phase === 'playing' ? prev.game : null;
  if (pg) {
    if (pg.seq > g.seq) fail(`${who} : la partie revient en arrière (${pg.stage}/${pg.step} → ${g.stage}/${g.step})`);
    if (!same(pg.order, g.order) || !same(pg.roles, g.roles)) fail('la table a changé en pleine partie');
    if (!same(g.claims.slice(0, pg.claims.length), pg.claims) || !same(g.chat.slice(0, pg.chat.length), pg.chat)) fail('une annonce ou un message a changé');
    if (pg.stage === g.stage && pg.step === g.step) {
      if (pg.endsAt !== g.endsAt) fail(`${who} : l'échéance de ${g.stage}/${g.step} a bougé après un geste`);
    }
    // La nuit avance au temps, jamais plus tôt, et chaque réveil dure autant, qu'on y agisse ou non.
    if (pg.stage === 'night' && (g.stage !== 'night' || g.step !== pg.step)) {
      if (v.serverNow < pg.endsAt - 1) fail(`l'étape de nuit ${pg.step} a fini ${pg.endsAt - v.serverNow} ms trop tôt`);
      if (g.stage === 'night') {
        if (g.step !== pg.step + 1) fail(`${who} : étape de nuit sautée (${pg.step} → ${g.step})`);
        const want = g.step === g.steps.length ? FAST.dawn : FAST.step + (g.steps[g.step] === 'doppel' ? FAST.doppelExtra : 0);
        if (g.endsAt - pg.endsAt < want - 2) fail(`l'étape ${g.steps[g.step] ?? 'aube'} dure ${g.endsAt - pg.endsAt} ms au lieu de ${want}`);
      } else if (g.stage !== 'day' || pg.step !== pg.steps.length) fail(`le jour se lève pendant l'étape ${pg.step}`);
    }
    // L'envoi même d'un état trahit un geste caché : un état sans rien de neuf pour tout le monde
    // ne doit arriver qu'à celui qui vient d'agir (geste de nuit, changement de vote, refus), ou à celui dont la nuit
    // vient de changer (dernier appel : l'appli a choisi pour lui un peu avant la fin, et lui seul le voit).
    if (publicPart(prev) === publicPart(v) && same(pg.night ?? null, g.night ?? null) && Date.now() - c.lastGesture > 300) fail(`${who} a reçu pendant ${g.stage} un état qui ne lui apprend rien : un geste caché ou refusé a été diffusé`);
  }

  if (!seated) return;
  const m = c.mem;
  if (g.stage === 'deal') {
    if (m.dealt && m.dealt !== g.myCard) fail(`${who} : sa carte a changé pendant la distribution`);
    m.dealt = g.myCard;
  }
  if (g.stage === 'night' && g.step >= 0 && g.step < g.steps.length) {
    const step = g.steps[g.step];
    if (m.awake.has(g.step) && m.awake.get(g.step) !== !!g.night) fail(`${who} : réveillé puis endormi pendant l'étape ${step}`);
    m.awake.set(g.step, !!g.night);
    if (g.night) {
      checkNight(c, v, g);
      m.seen.set(g.step, g.night.seen);
    }
    // Réveillé exactement quand son rôle est appelé (pour le Doppelgänger, quand on connaît sa copie).
    if (m.dealt && !(m.dealt === 'doppel' && !m.copy && step !== 'doppel')) {
      const expect = wakes(step, { role: m.dealt, copy: m.copy });
      if (expect !== !!g.night) fail(`${who} (${m.dealt}${m.copy ? `→${m.copy}` : ''}) ${g.night ? 'réveillé' : 'pas réveillé'} à l'étape ${step}`);
    }
  }
}

/** Ce qu'une vision montre : sa forme (« look », « rob »…) dit si elle en montre plus que le rôle ne le permet. */
function kindOf(vi, step, actor, order, roles, who) {
  const bad = (why) => fail(`${who} : vision invalide à l'étape ${step} (${why}) : ${JSON.stringify(vi)}`);
  for (const k of Object.keys(vi)) if (!VISION_KEYS.has(k)) bad(`clé ${k}`);
  if (!ROLES.includes(vi.as) || !Array.isArray(vi.cards)) bad('rôle ou cartes');
  const isP = (pl) => keysOf(pl) === 'player' && order.includes(pl.player);
  const isC = (pl) => keysOf(pl) === 'center' && Number.isInteger(pl.center) && pl.center >= 0 && pl.center < CENTER;
  for (const sc of vi.cards) if (keysOf(sc) !== 'place,role' || !roles.includes(sc.role) || !(isP(sc.place) || isC(sc.place))) bad('carte vue');
  const cs = vi.cards;
  let shape;
  if (vi.mates !== undefined) {
    if (cs.length || vi.swap) bad('partenaires et cartes');
    if (!Array.isArray(vi.mates) || vi.mates.some((x) => !order.includes(x) || x === actor) || new Set(vi.mates).size !== vi.mates.length) bad('partenaires');
    shape = 'mates';
  } else if (vi.swap !== undefined) {
    const [a, b] = vi.swap;
    if (vi.swap.length !== 2) bad('échange');
    if (isP(a) && a.player === actor && isP(b) && b.player !== actor && cs.length === 1 && isP(cs[0].place) && cs[0].place.player === actor) shape = 'rob';
    else if (isP(a) && isP(b) && a.player !== actor && b.player !== actor && a.player !== b.player && !cs.length) shape = 'swap';
    else if (isP(a) && a.player === actor && isC(b) && !cs.length) shape = 'drunk';
    else bad('échange');
  } else if (cs.length === 1 && isP(cs[0].place)) shape = cs[0].place.player === actor ? 'self' : 'look';
  else if (cs.length === 1) shape = 'peek';
  else if (cs.length === 2 && isC(cs[0].place) && isC(cs[1].place) && cs[0].place.center !== cs[1].place.center) shape = 'center2';
  else bad('cartes vues');
  const map = {
    doppel: { 'doppel:look': 'copy', 'voyante:look': 'seer', 'voyante:center2': 'seer', 'voleur:rob': 'rob', 'noiseuse:swap': 'swap', 'soulard:drunk': 'drunk', 'sbire:mates': 'mates' },
    loups: { 'loup:mates': 'mates', 'loup:peek': 'peek' },
    sbire: { 'sbire:mates': 'mates' },
    macons: { 'macon:mates': 'mates' },
    voyante: { 'voyante:look': 'seer', 'voyante:center2': 'seer' },
    voleur: { 'voleur:rob': 'rob' },
    noiseuse: { 'noiseuse:swap': 'swap' },
    soulard: { 'soulard:drunk': 'drunk' },
    insomniaque: { 'insomniaque:self': 'self' },
    'doppel-insomniaque': { 'insomniaque:self': 'self' },
  };
  const kind = map[step]?.[`${vi.as}:${shape}`];
  if (!kind) bad(`${vi.as} / ${shape}`);
  return kind;
}

/** Mon réveil : ce qu'on me demande suit ce que j'ai déjà vu, et rien de plus. */
function checkNight(c, v, g) {
  const who = c.name;
  const nt = g.night;
  const m = c.mem;
  if (keysOf(nt) !== NIGHT_KEYS) fail(`réveil de ${who} : ${keysOf(nt)}`);
  const step = g.steps[g.step];
  if (nt.step !== step) fail(`${who} : réveil pour ${nt.step} pendant ${step}`);
  if (nt.ask !== null && !ASKS.includes(nt.ask)) fail(`${who} : geste demandé inconnu ${nt.ask}`);
  const kinds = nt.seen.map((vi) => kindOf(vi, step, v.me, g.order, g.roles, who));
  if (m.dealt === 'doppel') {
    if (step === 'doppel' && kinds[0] === 'copy') m.copy = nt.seen[0].cards[0].role;
    // Copie faite par l'appli faute de geste à temps : on l'apprend en se réveillant avec le rôle copié.
    if (!m.copy && step !== 'doppel') m.copy = { loups: 'loup', macons: 'macon', 'doppel-insomniaque': 'insomniaque' }[step] ?? null;
  }
  if (!m.dealt) fail(`${who} se réveille sans avoir vu sa carte`);
  const expectAs = step === 'doppel' ? (m.copy ?? 'doppel') : (AS_AT[step] ?? step);
  if (nt.as !== expectAs) fail(`${who} réveillé comme ${nt.as} au lieu de ${expectAs} à l'étape ${step}`);
  const seqs = allowedKinds(step, { role: m.dealt, copy: m.copy });
  const path = nt.ask ? [...kinds, nt.ask] : kinds;
  if (!seqs.some((s) => (nt.ask ? startsWith(s, path) : same(s, path)))) fail(`${who} : réveil incohérent à l'étape ${step} (vu : ${kinds.join(', ') || 'rien'} ; demandé : ${nt.ask})`);
  if (step === 'loups') {
    const lone = nt.seen[0].mates.length === 0;
    if (!lone && (nt.ask || kinds.includes('peek'))) fail(`${who} : un Loup-Garou accompagné peut regarder le centre`);
    if (lone && !kinds.includes('peek') && nt.ask !== 'peek') fail(`${who} : un Loup-Garou seul ne peut pas regarder le centre`);
  }
}

// ───────────────────────────── Les humains jouent ─────────────────────────────

function play(c) {
  const v = c.view;
  const g = v?.game;
  if (!current || !g || v.phase !== 'playing' || c.offline || !g.order.includes(v.me)) return;
  const others = g.order.filter((id) => id !== v.me);
  if (g.stage === 'deal') onDeal(c, g, others);
  else if (g.stage === 'night') onNight(c, v, g, others);
  else if (g.stage === 'day') onDay(c, v, g, others);
  else if (g.stage === 'vote') onVote(c, v, g, others);
}

function onDeal(c, g, others) {
  const m = c.mem;
  if (m.once.has('deal')) return;
  m.once.add('deal');
  later(c, rand(0, 200), async () => {
    if (Math.random() < 0.5) {
      await refuse(c, 'game:claim', { kind: 'noWolf' }, 'une annonce pendant la distribution', /débat/);
      await refuse(c, 'game:vote', { target: pick(others) }, 'un vote pendant la distribution', /vote/);
      await refuse(c, 'game:act', { step: -1, center: [0] }, 'un geste de nuit pendant la distribution', /moment|passée/);
    }
    // Parfois il ne touche à rien : la distribution s'achève au temps.
    if (Math.random() < 0.15) {
      stats.dealIdle++;
      return;
    }
    await accept(c, 'game:seen', {}, 'carte vue');
    stats.seen++;
  });
}

function choose(ask, others) {
  const centers = shuffle([0, 1, 2]);
  switch (ask) {
    case 'copy':
    case 'rob':
      return { players: [pick(others)] };
    case 'seer':
      return Math.random() < 0.5 ? { players: [pick(others)] } : { center: centers.slice(0, 2) };
    case 'swap':
      return { players: shuffle(others).slice(0, 2) };
    default:
      return { center: [centers[0]] };
  }
}
function badPick(ask, me, others) {
  switch (ask) {
    case 'copy':
    case 'rob':
      return { players: [me] };
    case 'seer':
      return { center: [1] };
    case 'swap':
      return { players: [others[0], others[0]] };
    default:
      return { center: [0, 2] };
  }
}
const normalize = (p) => ({ players: p.players ?? [], center: p.center ?? [] });
/** Les cartes touchées par un geste, d'après sa vision. */
function targetsOf(vi, me) {
  const places = vi.swap ?? vi.cards.map((x) => x.place);
  return {
    players: places.filter((pl) => 'player' in pl && pl.player !== me).map((pl) => pl.player),
    center: places.filter((pl) => 'center' in pl).map((pl) => pl.center),
  };
}

function onNight(c, v, g, others) {
  const m = c.mem;
  const step = g.step;
  const ask = g.night?.ask;
  if (ask) {
    // Un seul envoi par geste demandé : on ne rejoue pas sur un état périmé.
    const key = `${step}:${ask}`;
    if (m.sent.has(key)) return;
    m.sent.add(key);
    if (Math.random() < (ask === 'seer' || ask === 'peek' ? 0.2 : 0.1)) {
      stats.nightIdle++;
      return;
    }
    later(c, rand(30, 350), async () => {
      const now = c.view?.game;
      if (now?.stage !== 'night' || now.step !== step) {
        stats.nightLate++;
        return;
      }
      if (Math.random() < 0.35) {
        await refuse(c, 'game:act', { step: step + 1, ...choose(ask, others) }, 'un geste pour une autre étape', /passée|pas à toi/);
        await refuse(c, 'game:act', { step, ...badPick(ask, v.me, others) }, `un geste mal formé (${ask})`, /autre joueur|Touche|invalide/);
      }
      const p = choose(ask, others);
      const res = await gesture(c, 'game:act', { step, ...p });
      if (!res?.ok) {
        if (/passée/.test(res?.error ?? '')) {
          stats.nightLate++;
          return;
        }
        fail(`${c.name} : geste de nuit refusé (${res?.error}) pour ${ask} ${JSON.stringify(p)}`);
      }
      m.acts.push({ step, ask, pick: normalize(p) });
      stats.acts++;
      // Le nouvel état n'est renvoyé qu'à son auteur, et avant l'accusé de réception.
      const after = c.view?.game?.night;
      if (!after || after.ask === ask) fail(`${c.name} : son geste de nuit (${ask}) ne lui a pas été renvoyé`);
      if (!after.ask && Math.random() < 0.5) await refuse(c, 'game:act', { step, ...p }, 'un second geste de nuit', /pas à toi|passée/);
    });
  } else if (!g.night && step >= 0 && step <= g.steps.length - 2 && !m.once.has('sleepy')) {
    // Endormi : il n'a rien à faire, et tout ce qu'il tente est refusé (le jour est encore loin).
    m.once.add('sleepy');
    later(c, rand(20, 200), async () => {
      await refuse(c, 'game:act', { step, players: [pick(others)] }, 'un geste de nuit sans être réveillé', /pas à toi|passée/);
      await refuse(c, 'game:claim', { kind: 'suspect', players: [pick(others)] }, 'une annonce la nuit', /débat/);
      await refuse(c, 'game:vote', { target: pick(others) }, 'un vote la nuit', /vote/);
      await refuse(c, 'game:say', { text: 'psst' }, 'un message la nuit', /voix haute|débat/);
    });
  }
}

const LINES = ['Je crois la Voyante.', 'Qui a été échangé cette nuit ?', 'Je ne me suis pas réveillé, promis.', 'Méfiez-vous de mon voisin de gauche.', 'Le Voleur ment !'];

function roleClaim(c, g, others) {
  const role = Math.random() < 0.5 && c.mem.dealt ? c.mem.dealt : pick(g.roles);
  const p = { kind: 'role', role };
  const r = () => pick(g.roles);
  switch (role) {
    case 'voyante':
      if (Math.random() < 0.5) Object.assign(p, { players: [pick(others)], saw: [r()] });
      else Object.assign(p, { center: [0, 2], saw: [r(), r()] });
      break;
    case 'voleur':
    case 'doppel':
      Object.assign(p, { players: [pick(others)], saw: [r()] });
      break;
    case 'noiseuse':
      p.players = shuffle(others).slice(0, 2);
      break;
    case 'soulard':
      p.center = [Math.floor(Math.random() * 3)];
      break;
    case 'insomniaque':
      p.saw = [r()];
      break;
    case 'macon':
      if (Math.random() < 0.5) p.alone = true;
      else p.players = [pick(others)];
      break;
    case 'loup':
      Object.assign(p, { alone: true, center: [1], saw: [r()] });
      break;
    case 'sbire':
      p.alone = true;
      break;
  }
  return p;
}
const claimShape = (cl) => JSON.stringify({ kind: cl.kind, role: cl.role, players: cl.players, center: cl.center, saw: cl.saw, alone: cl.alone });

async function claim(c, payload) {
  await accept(c, 'game:claim', payload, `l'annonce ${JSON.stringify(payload)}`);
  c.mem.claims.push(payload);
  stats.claims++;
}
async function say(c, text, expected = text) {
  await accept(c, 'game:say', { text }, 'un message');
  c.mem.says.push(expected);
  stats.says++;
}

function onDay(c, v, g, others) {
  const m = c.mem;
  if (m.once.has('day')) return;
  m.once.add('day');
  const me = v.me;
  const ecrit = v.settings.talk === 'ecrit';
  const isHost = v.hostId === me;
  const plan = current.plan;
  later(c, rand(20, 250), async () => {
    await refuse(c, 'game:vote', { target: pick(others) }, 'un vote pendant le débat', /vote/);
    await refuse(c, 'game:act', { step: g.step, center: [0] }, 'un geste de nuit pendant le débat', /moment/);
    await refuse(c, 'game:claim', { kind: 'suspect', players: [me] }, 'se soupçonner soi-même', /invalide/);
    const absent = ROLES.find((r) => !g.roles.includes(r));
    if (absent) await refuse(c, 'game:claim', { kind: 'role', role: absent }, 'annoncer un rôle hors jeu', /pas en jeu/);
    if (!ecrit) await refuse(c, 'game:say', { text: 'Je suis la Voyante !' }, 'un message écrit en débat à voix haute', /voix haute/);
    if (!isHost) await refuse(c, 'game:voteNow', {}, 'un invité qui passe au vote', /hôte/);
    await claim(c, roleClaim(c, g, others));
    if (Math.random() < 0.6) await claim(c, { kind: 'suspect', players: [pick(others)] });
    if (Math.random() < 0.25) await claim(c, { kind: 'noWolf' });
    if (ecrit) {
      await say(c, pick(LINES));
      if (Math.random() < 0.5) await say(c, '  Moi,\u0007 je   vote\tpour  le voisin  ', 'Moi, je vote pour le voisin');
      if (Math.random() < 0.3) await say(c, 'a'.repeat(260), 'a'.repeat(200));
      await refuse(c, 'game:say', { text: ' \n ' }, 'un message vide', /vide/);
    }
    // Prêt puis plus prêt : personne d'autre ne peut être prêt avant que tous les humains aient parlé (voir plus bas).
    if (plan.ready && Math.random() < 0.4) {
      await accept(c, 'game:ready', { ready: true }, 'prêt');
      await accept(c, 'game:ready', { ready: false }, 'plus prêt');
      stats.readyToggles++;
    }
    m.dayDone = true;
    const allSpoke = () => current.humans.every((h) => h.mem.dayDone);
    if (plan.ready) {
      await waitFor('les autres humains ont parlé', allSpoke, 5000);
      await accept(c, 'game:ready', { ready: true }, 'prêt à voter');
      stats.ready++;
    } else if (plan.voteNow && isHost) {
      await waitFor('les autres humains ont parlé', allSpoke, 5000);
      await accept(c, 'game:voteNow', {}, 'passer au vote');
      stats.voteNow++;
    }
  });
}

async function vote(c, target, change = false) {
  const res = await gesture(c, 'game:vote', { target });
  if (!res?.ok) {
    if (/pas ouvert/.test(res?.error ?? '')) {
      stats.lateVotes++;
      return false;
    }
    fail(`${c.name} : vote refusé (${res?.error})`);
  }
  c.mem.votes.push(target);
  stats.votes++;
  // Un changement d'avis n'est renvoyé qu'à son auteur, avant l'accusé de réception ; le premier vote est diffusé à tous, juste après.
  const g = c.view?.game;
  if (change && g?.stage === 'vote' && g.myVote !== target) fail(`${c.name} : son changement de vote ne lui a pas été renvoyé`);
  await waitFor(`${c.name} voit son vote`, () => c.view?.game?.stage !== 'vote' || c.view.game.myVote === target, 3000);
  return true;
}

function onVote(c, v, g, others) {
  const m = c.mem;
  if (m.once.has('vote')) return;
  m.once.add('vote');
  const me = v.me;
  const late = m.lateVoter;
  // Un humain vote en dernier : les autres ont le temps de changer d'avis avant la fin du vote.
  later(c, late ? rand(450, 650) : rand(30, 150), async () => {
    await refuse(c, 'game:vote', { target: me }, 'un vote pour soi', /soi|pas ouvert/);
    await refuse(c, 'game:vote', { target: 'personne' }, 'un vote pour un inconnu', /inconnu|pas ouvert/);
    if (Math.random() < 0.5) await refuse(c, 'game:claim', { kind: 'noWolf' }, 'une annonce pendant le vote', /débat/);
    if (late && v.settings.talk === 'ecrit') await say(c, 'Je vote en dernier.');
    // Chacun pour son voisin de gauche (partie entre humains) : au bout du compte, une voix chacun.
    const neighbour = current.plan.neighbour ? g.order[(g.order.indexOf(me) + 1) % g.order.length] : null;
    const change = !late && Math.random() < 0.5;
    const first = neighbour && !change ? neighbour : pick(others.filter((x) => x !== neighbour));
    if (!(await vote(c, first))) return;
    if (change) {
      await pause(rand(40, 120));
      if (await vote(c, neighbour ?? pick(others.filter((x) => x !== first)), true)) stats.changes++;
    }
  });
}

// ───────────────────────────── Le dévoilement, rejoué ─────────────────────────────

function checkFinal(label, final, seenGame, humans, winsBefore) {
  const order = seenGame.order;
  const n = order.length;
  const byId = new Map(final.players.map((p) => [p.id, p]));
  const name = (id) => byId.get(id)?.name ?? id;
  if (keysOf(final) !== FINAL_KEYS || keysOf(final.outcome) !== OUTCOME_KEYS) fail(`${label} : dévoilement mal formé`);
  if (!same(final.players.map((p) => p.id), order)) fail(`${label} : les joueurs du dévoilement ne sont pas ceux de la partie`);
  if (!same(final.roles, seenGame.roles) || !same(final.steps, seenGame.steps)) fail(`${label} : rôles ou étapes différents de ceux de la partie`);
  if (!same(final.claims, seenGame.claims)) fail(`${label} : annonces différentes de celles du débat`);
  final.players.forEach((p, i) => {
    if (keysOf(p) !== FINAL_PLAYER_KEYS || p.seat !== i + 1) fail(`${label} : fiche de ${p.name} : ${keysOf(p)}, place ${p.seat}`);
  });

  // Les cartes : les rôles en jeu, chacune à une seule place au début et à la fin.
  const cards = final.cards;
  if (cards.length !== n + CENTER || cards.some((cd, i) => keysOf(cd) !== 'copy,id,role' || cd.id !== i)) fail(`${label} : cartes mal numérotées`);
  if (!same(sortRoles(cards.map((cd) => cd.role)), final.roles)) fail(`${label} : les cartes ne sont pas les rôles en jeu`);
  for (const ids of [
    [...final.players.map((p) => p.startCard), ...final.centerStart],
    [...final.players.map((p) => p.endCard), ...final.centerEnd],
  ])
    if ([...ids].sort((a, b) => a - b).join() !== cards.map((cd) => cd.id).join()) fail(`${label} : une carte perdue ou en double`);
  const startCard = (id) => cards[byId.get(id).startCard];
  for (const cd of cards) {
    const dealt = final.players.some((p) => p.startCard === cd.id);
    if (cd.role !== 'doppel' ? cd.copy !== null : dealt !== (cd.copy !== null)) fail(`${label} : copie du Doppelgänger incohérente (${JSON.stringify(cd)})`);
  }

  // La nuit, rejouée : chaque réveil au bon moment, chaque carte vue telle qu'elle était, chaque échange appliqué.
  const wolves = order.filter((id) => wakes('loups', startCard(id)));
  const masons = order.filter((id) => wakes('macons', startCard(id)));
  const hand = new Map(final.players.map((p) => [p.id, p.startCard]));
  const center = [...final.centerStart];
  const at = (pl) => ('player' in pl ? hand.get(pl.player) : center[pl.center]);
  const put = (pl, id) => ('player' in pl ? hand.set(pl.player, id) : (center[pl.center] = id));
  const kinds = new Map();
  let last = -1;
  for (const e of final.events) {
    if (keysOf(e) !== EVENT_KEYS || !byId.has(e.actor)) fail(`${label} : réveil mal formé ${JSON.stringify(e)}`);
    const si = final.steps.indexOf(e.step);
    if (si < last) fail(`${label} : récit de la nuit dans le désordre`);
    last = si;
    const card = startCard(e.actor);
    if (!wakes(e.step, card)) fail(`${label} : ${name(e.actor)} (${card.role}) agit à l'étape ${e.step}`);
    const kind = kindOf(e.vision, e.step, e.actor, order, final.roles, label);
    const vi = e.vision;
    if (vi.swap) {
      const a = at(vi.swap[0]);
      put(vi.swap[0], at(vi.swap[1]));
      put(vi.swap[1], a);
    }
    for (const sc of vi.cards) if (cards[at(sc.place)].role !== sc.role) fail(`${label} : ${name(e.actor)} a vu ${sc.role} là où il y avait ${cards[at(sc.place)].role}`);
    if (kind === 'mates') {
      const want = vi.as === 'sbire' ? wolves : (vi.as === 'macon' ? masons : wolves).filter((x) => x !== e.actor);
      if (!same(vi.mates, want)) fail(`${label} : ${name(e.actor)} (${vi.as}) voit ${vi.mates.map(name)} au lieu de ${want.map(name)}`);
    }
    if (kind === 'copy' && card.copy !== vi.cards[0].role) fail(`${label} : le Doppelgänger a copié ${vi.cards[0].role}, sa carte dit ${card.copy}`);
    if (!ACTS.has(kind) && e.auto && !(e.step === 'doppel' && vi.as === 'sbire')) fail(`${label} : un réveil de ${name(e.actor)} marqué « au hasard »`);
    const k = `${e.actor}|${e.step}`;
    kinds.set(k, [...(kinds.get(k) ?? []), kind]);
    stats.events++;
  }
  for (const id of order) {
    const card = startCard(id);
    for (const s of final.steps) {
      if (!wakes(s, card)) continue;
      const got = kinds.get(`${id}|${s}`) ?? [];
      if (!allowedKinds(s, card).some((seq) => same(seq, got))) fail(`${label} : ${name(id)} (${card.role}${card.copy ? `→${card.copy}` : ''}) à l'étape ${s} : ${got.join(', ') || 'rien'}`);
      if (got.includes('peek') && wolves.length !== 1) fail(`${label} : un Loup-Garou accompagné a regardé le centre`);
    }
  }
  for (const p of final.players) if (hand.get(p.id) !== p.endCard) fail(`${label} : la carte de ${p.name} à la fin ne suit pas les échanges de la nuit`);
  if (!same(center, final.centerEnd)) fail(`${label} : le centre à la fin ne suit pas les échanges de la nuit`);

  // Le vote, résolu selon les règles.
  const roleOf = {};
  const votes = {};
  for (const p of final.players) {
    roleOf[p.id] = effective(cards[p.endCard]);
    if (p.as !== roleOf[p.id] || p.team !== teamOf(p.as)) fail(`${label} : ${p.name} finit ${p.as} (${p.team}), sa carte dit ${roleOf[p.id]}`);
    if (!order.includes(p.vote) || p.vote === p.id) fail(`${label} : vote de ${p.name} invalide (${p.vote})`);
    votes[p.id] = p.vote;
  }
  for (const p of final.players) if (p.votes !== final.players.filter((q) => q.vote === p.id).length) fail(`${label} : voix de ${p.name} mal comptées`);
  const want = resolve(order, votes, roleOf);
  for (const k of Object.keys(want)) if (!same(final.outcome[k], want[k])) fail(`${label} : issue du vote fausse (${k} : ${JSON.stringify(final.outcome[k])} au lieu de ${JSON.stringify(want[k])})`);
  for (const p of final.players) {
    if (p.dead !== want.dead.includes(p.id) || p.winner !== want.winners.includes(p.id)) fail(`${label} : ${p.name} mal marqué (mort ${p.dead}, gagnant ${p.winner})`);
    if (p.wins !== (winsBefore.get(p.id) ?? 0) + (p.winner ? 1 : 0)) fail(`${label} : victoires de ${p.name} mal comptées`);
  }

  // Ce que chaque humain a vu et fait colle au dévoilement.
  for (const c of humans) {
    const id = c.session.playerId;
    const p = byId.get(id);
    const m = c.mem;
    const card = startCard(id);
    if (!m.dealt || card.role !== m.dealt) fail(`${label} : ${c.name} a vu ${m.dealt} à la distribution, mais a reçu ${card.role}`);
    if (m.copy && card.copy !== m.copy) fail(`${label} : ${c.name} croit avoir copié ${m.copy}, sa carte dit ${card.copy}`);
    for (const [si, awake] of m.awake) if (awake !== wakes(final.steps[si], card)) fail(`${label} : ${c.name} ${awake ? 'réveillé' : 'endormi'} à tort à l'étape ${final.steps[si]}`);
    for (const [si, seen] of m.seen) {
      // Le dernier appel montre au joueur le choix fait pour lui ; seul un geste fait en son absence peut lui échapper.
      const evs = final.events.filter((e) => e.actor === id && e.step === final.steps[si]);
      const told = evs.map((e) => e.vision);
      if (!same(told.slice(0, seen.length), seen) || evs.slice(seen.length).some((e) => !e.auto)) fail(`${label} : ${c.name} n'a pas vu à l'étape ${final.steps[si]} ce que raconte le dévoilement`);
      stats.visions++;
    }
    const acts = final.events.filter((e) => e.actor === id && !e.auto && ACTS.has(kindOf(e.vision, e.step, id, order, final.roles, label)));
    if (acts.length !== m.acts.length) fail(`${label} : ${c.name} a fait ${m.acts.length} geste(s) de nuit, le dévoilement en raconte ${acts.length}`);
    m.acts.forEach((a, i) => {
      const e = acts[i];
      if (e.step !== final.steps[a.step] || !same(targetsOf(e.vision, id), a.pick)) fail(`${label} : le geste de ${c.name} à l'étape ${final.steps[a.step]} n'est pas celui raconté`);
    });
    const lastVote = m.votes.at(-1);
    if (lastVote ? p.vote !== lastVote || p.autoVote : !p.autoVote) fail(`${label} : vote de ${c.name} mal dévoilé (${p.vote}, au hasard : ${p.autoVote})`);
    if (!same(final.claims.filter((cl) => cl.by === id).map(claimShape), m.claims.map(claimShape))) fail(`${label} : annonces de ${c.name} mal enregistrées`);
    if (!same(seenGame.chat.filter((l) => l.by === id).map((l) => l.text), m.says)) fail(`${label} : messages de ${c.name} mal enregistrés`);
  }
}

async function finishGame(label, observers) {
  await waitFor(`la fin de ${label}`, () => observers.every((c) => c.view?.phase === 'finished'), 60_000);
  const final = host.view.final;
  const seenGame = host.lastGame;
  for (const c of observers) {
    if (!same(c.view.final, final)) fail(`${c.name} ne voit pas le même dévoilement`);
    if (c.lastGame?.stage !== 'over') fail(`${c.name} n'a pas vu la fin du vote`);
    if (!same(c.lastGame.claims, seenGame.claims) || !same(c.lastGame.chat, seenGame.chat)) fail(`${c.name} n'a pas vu les mêmes annonces ou messages`);
    for (const p of c.view.players) {
      const fp = final.players.find((q) => q.id === p.id);
      if (fp && fp.wins !== p.wins) fail(`${c.name} ne voit pas les victoires de ${p.name}`);
    }
  }
  checkFinal(label, final, seenGame, current.humans, current.winsBefore);
  results.push({ label, final, settings: host.view.settings });
  current = null;
}

/** Une partie : on se souvient de qui joue, des victoires d'avant, et qui vote en dernier. */
async function startGame(label, plan, humans) {
  current = { label, plan, humans, winsBefore: winsOf(host.view) };
  pick(humans).mem.lateVoter = true;
  await accept(host, 'game:start', {}, `le lancement de ${label}`);
  await waitFor(`la distribution de ${label}`, () => humans.every((c) => c.view?.phase === 'playing'));
}

async function backToLobby(observers) {
  await accept(host, 'game:restart', {}, 'la revanche');
  await waitFor('le retour au salon', () => observers.every((c) => c.view?.phase === 'lobby' && !c.view.final && !c.view.game));
  // Une nouvelle partie : les numéros d'état repartent de zéro, chacun oublie la précédente.
  for (const c of observers) c.reset();
}

/** Attendre le début d'une étape de nuit, avec assez de temps devant soi pour vérifier un silence. */
async function nightWindow(what) {
  const s0 = host.view.game.step;
  await waitFor(what, () => host.view.game.stage !== 'night' || host.view.game.step > s0, 5000);
  const g = host.view.game;
  if (g.stage !== 'night' || g.step >= g.steps.length || g.endsAt - Date.now() < 600) fail(`${what} : plus d'étape de nuit assez longue pour vérifier`);
}

// ───────────────────────────── Partie 1 : 3 humains + 2 bots, réglages par défaut ─────────────────────────────

const host = client('Ana', { avatar: 'chouette' });
await connected(host);
await refuse(host, 'game:seen', {}, 'un geste sans table', /plus à cette table/);
const created = await host.call('room:create', { name: 'Ana', avatar: 'chouette', bots: 2 });
if (!created?.ok) fail(`création de la table : ${created?.error}`);
host.session = created.data;
tokens.add(created.data.token);
const code = created.data.code;
const bob = client('Bob', { avatar: 'renard' });
const chloe = client('Chloé', { avatar: 'chat' });
await Promise.all([connected(bob), connected(chloe)]);
for (const c of [bob, chloe]) {
  const res = await c.call('room:join', { code: code.toLowerCase(), name: c.name, avatar: c.avatar });
  if (!res?.ok) fail(`arrivée de ${c.name} : ${res?.error}`);
  c.session = res.data;
  tokens.add(res.data.token);
}
await refuse(chloe, 'room:join', { code: '0000', name: 'Chloé' }, 'une table inconnue', /introuvable/);
await waitFor('le salon au complet', () => [host, bob, chloe].every((c) => c.view?.players.length === 5));
const ids = { ana: host.session.playerId, bob: bob.session.playerId, chloe: chloe.session.playerId };
if (!same(host.view.settings, DEFAULT_SETTINGS)) fail(`réglages par défaut inattendus : ${JSON.stringify(host.view.settings)}`);
if (host.view.players.filter((p) => p.isBot).length !== 2 || host.view.hostId !== ids.ana) fail('table de départ inattendue');

// Au salon, rien ne bouge tout seul : un geste refusé ne doit rien envoyer aux autres.
await quiet([host, chloe], 'gestes interdits d’un invité au salon', async () => {
  await refuse(bob, 'room:settings', { talk: 'ecrit' }, 'un invité qui change les réglages', /hôte/);
  await refuse(bob, 'game:start', {}, 'un invité qui lance la partie', /hôte/);
  await refuse(bob, 'room:addBot', {}, 'un invité qui ajoute un bot', /hôte/);
  await refuse(bob, 'room:kick', { playerId: ids.chloe }, 'un invité qui retire un joueur', /hôte/);
  await refuse(bob, 'game:restart', {}, 'un invité qui relance', /hôte/);
  await refuse(bob, 'game:end', {}, 'un invité qui arrête la partie', /hôte/);
  await refuse(bob, 'game:voteNow', {}, 'un invité qui passe au vote', /hôte/);
  await refuse(bob, 'game:seen', {}, 'une carte vue au salon', /Aucune partie/);
  await refuse(bob, 'game:act', { step: 0, players: [ids.ana] }, 'un geste de nuit au salon', /Aucune partie/);
  await refuse(bob, 'game:claim', { kind: 'noWolf' }, 'une annonce au salon', /Aucune partie/);
  await refuse(bob, 'game:vote', { target: ids.ana }, 'un vote au salon', /Aucune partie/);
  await refuse(bob, 'game:ready', { ready: true }, 'prêt au salon', /Aucune partie/);
  await refuse(bob, 'game:say', { text: 'salut' }, 'un message au salon', /voix haute/);
});
await quiet([bob, chloe], 'gestes interdits de l’hôte au salon', async () => {
  await refuse(host, 'room:kick', { playerId: ids.ana }, "l'hôte qui se retire lui-même", /introuvable/);
  await refuse(host, 'room:settings', { custom: ['loup', 'loup', 'loup'] }, 'trois Loups-Garous', /boîte/);
});
await accept(host, 'room:settings', { day: 180, tips: false }, 'les réglages');
await waitFor('les nouveaux réglages', () => chloe.view.settings.day === 180 && chloe.view.settings.tips === false);
// Des valeurs inconnues sont ignorées.
await accept(host, 'room:settings', { day: 42, talk: 'mime', pace: 'vite', scenario: 'inconnu', tips: 'oui' }, 'des réglages fantaisistes');
await pause(80);
const s1 = host.view.settings;
if (s1.day !== 180 || s1.talk !== 'oral' || s1.pace !== 'posee' || s1.scenario !== 'premiere' || s1.tips !== false) fail(`une valeur inconnue a été acceptée : ${JSON.stringify(s1)}`);
await accept(host, 'room:settings', { day: 300, tips: true }, 'le retour aux réglages par défaut');
await waitFor('les réglages par défaut', () => same(chloe.view.settings, DEFAULT_SETTINGS));
// Les réactions : une inconnue est ignorée, une connue arrive à tous.
const heardBefore = chloe.emotes.length;
bob.socket.emit('emote', { emoji: 'coucou' });
await pause(150);
if (chloe.emotes.length !== heardBefore) fail('une réaction inconnue a été diffusée');
bob.socket.emit('emote', { emoji: '🤔' });
await waitFor('la réaction de Bob', () => chloe.emotes.length > heardBefore && host.emotes.length > 0);
if (chloe.emotes.at(-1).emoji !== '🤔' || chloe.emotes.at(-1).playerId !== ids.bob) fail('réaction perdue');

await startGame('partie 1', { ready: true, voteNow: false }, [host, bob, chloe]);
if (!same(host.view.game.roles, PREMIERE[5])) fail(`composition de « Première nuit » à 5 : ${host.view.game.roles}`);

// Une spectatrice arrive pendant la distribution : elle voit la partie, sans siège ni carte, et ne peut rien y faire.
const dora = client('Dora', { player: false, avatar: 'cerf' });
await connected(dora);
const doraJoin = await dora.call('room:join', { code, name: 'Dora', avatar: 'cerf' });
if (!doraJoin?.ok) fail(`arrivée de Dora : ${doraJoin?.error}`);
dora.session = doraJoin.data;
tokens.add(doraJoin.data.token);
ids.dora = dora.session.playerId;
await waitFor('la vue de Dora', () => dora.view?.game);
const doraSeat = dora.view.players.find((p) => p.id === ids.dora);
if (doraSeat?.status !== 'spectator' || doraSeat.seat !== null) fail('la retardataire devrait regarder');
if (dora.view.game.myCard !== null || dora.view.game.night !== null || dora.view.game.myVote !== null) fail('la spectatrice voit des secrets');
for (const [event, payload, what, reason] of [
  ['game:seen', {}, 'une spectatrice qui regarde une carte', /regardes/],
  ['game:act', { step: dora.view.game.step, players: [ids.ana] }, 'une spectatrice qui agit la nuit', /regardes/],
  ['game:claim', { kind: 'noWolf' }, 'une spectatrice qui annonce', /regardes/],
  ['game:vote', { target: ids.ana }, 'une spectatrice qui vote', /regardes/],
  ['game:ready', { ready: true }, 'une spectatrice prête', /regardes/],
  ['game:say', { text: 'coucou' }, 'une spectatrice qui écrit', /voix haute/],
  ['game:voteNow', {}, 'une spectatrice qui passe au vote', /hôte/],
  ['game:restart', {}, 'une spectatrice qui relance', /hôte/],
  ['game:end', {}, 'une spectatrice qui arrête la partie', /hôte/],
  ['room:settings', { talk: 'ecrit' }, 'une spectatrice qui change les réglages', /hôte/],
  ['room:addBot', {}, 'une spectatrice qui ajoute un bot', /hôte/],
])
  await refuse(dora, event, payload, what, reason);

// Bob se coupe pendant la nuit, puis reprend sa session ; Chloé tente de la lui voler.
await waitFor('la première étape de la nuit', () => host.view.game.stage === 'night' && host.view.game.step >= 0, 10_000);
bob.offline = true;
await waitFor('les gestes en cours de Bob', () => bob.inflight === 0, 3000);
bob.socket.disconnect();
await waitFor('Bob vu déconnecté', () => host.view.players.find((p) => p.id === ids.bob).connected === false, 3000);
await pause(350);
bob.socket.connect();
await connected(bob);
const back = await bob.call('room:join', { code, playerId: ids.bob, token: bob.session.token, resumeOnly: true });
if (!back?.ok || back.data.playerId !== ids.bob || back.data.token !== bob.session.token) fail(`retour de Bob : ${back?.error}`);
bob.offline = false;
await waitFor('le retour de Bob', () => bob.view && host.view.players.find((p) => p.id === ids.bob).connected, 3000);
if (bob.view.game?.myCard !== null) fail('Bob revoit sa carte après la distribution');
stats.resumes++;
const aBot = host.view.players.find((p) => p.isBot).id;
await refuse(chloe, 'room:join', { code, playerId: ids.bob, token: 'faux', resumeOnly: true }, 'une session volée', /expirée/);
await refuse(chloe, 'room:join', { code, playerId: aBot, token: bob.session.token, resumeOnly: true }, "la session d'un bot", /expirée/);
await refuse(chloe, 'room:join', { code, playerId: ids.bob, resumeOnly: true }, 'une reprise sans jeton', /expirée/);

// La nuit, l'hôte tente ce qui est interdit : Dora, qui ne fait rien, ne doit rien recevoir (ni état, ni réaction).
await nightWindow('une étape de nuit après le retour de Bob');
await quiet([dora], 'gestes refusés la nuit', async () => {
  await refuse(host, 'game:claim', { kind: 'noWolf' }, 'une annonce la nuit', /débat/);
  await refuse(host, 'game:vote', { target: ids.bob }, 'un vote la nuit', /vote/);
  await refuse(host, 'game:act', { step: 99, center: [0] }, 'un geste pour une étape inconnue', /passée/);
  await refuse(host, 'room:settings', { talk: 'ecrit' }, 'des réglages en pleine partie', /salon/);
  await refuse(host, 'game:start', {}, 'une partie lancée deux fois', /déjà lancée/);
  await refuse(host, 'room:addBot', {}, 'un bot ajouté en pleine partie', /salon/);
  await refuse(host, 'room:kick', { playerId: aBot }, 'un joueur retiré en pleine partie', /salon/);
  host.socket.emit('emote', { emoji: '🐺' });
});

await finishGame('partie 1', [host, bob, chloe, dora]);

// ───────────────────────────── Partie 2 : revanche à 10, débat par écrit ─────────────────────────────

const members = [host, bob, chloe, dora];
await refuse(bob, 'game:restart', {}, 'un invité qui relance', /hôte/);
await refuse(dora, 'game:restart', {}, 'une spectatrice qui relance', /hôte/);
await backToLobby(members);
if (host.view.players.find((p) => p.id === ids.dora).status !== 'lobby') fail('la spectatrice ne s’assoit pas pour la revanche');
dora.player = true;
await accept(host, 'room:settings', { talk: 'ecrit' }, 'le débat par écrit');
for (let i = 0; i < 4; i++) await accept(host, 'room:addBot', {}, 'un bot de plus');
await waitFor('la table pleine', () => seatedCount(host.view) === MAX_PLAYERS && host.view.settings.talk === 'ecrit');
await refuse(host, 'room:addBot', {}, 'un onzième joueur', /complète/);
const eli = client('Eli', { player: false, avatar: 'herisson' });
await connected(eli);
await refuse(eli, 'room:join', { code, name: 'Eli', avatar: 'herisson' }, 'une arrivée à table complète', /complète/);

await startGame('partie 2', { ready: false, voteNow: true }, [host, bob, chloe, dora]);
if (!same(host.view.game.roles, PREMIERE[10])) fail(`composition de « Première nuit » à 10 : ${host.view.game.roles}`);
await waitFor('la nuit de la partie 2', () => host.view.game.stage === 'night', 10_000);
const eliJoin = await eli.call('room:join', { code, name: 'Eli', avatar: 'herisson' });
if (!eliJoin?.ok) fail(`arrivée d'Eli en spectateur : ${eliJoin?.error}`);
eli.session = eliJoin.data;
tokens.add(eliJoin.data.token);
ids.eli = eli.session.playerId;
members.push(eli);
await waitFor('la vue d’Eli', () => eli.view?.game);
if (eli.view.players.find((p) => p.id === ids.eli).status !== 'spectator') fail('Eli devrait regarder');
await refuse(eli, 'game:say', { text: 'Je regarde !' }, 'un spectateur qui écrit', /regardes/);
await refuse(eli, 'game:seen', {}, 'un spectateur qui regarde une carte', /regardes/);
await finishGame('partie 2', members);

// ───────────────────────────── Partie 3 : composition sur mesure à 5 ─────────────────────────────

await backToLobby(members);
// La table était pleine à la revanche : Eli reste spectateur.
if (host.view.players.find((p) => p.id === ids.eli).status !== 'spectator') fail('Eli aurait dû rester spectateur');
const bots = host.view.players.filter((p) => p.isBot);
await refuse(bob, 'room:kick', { playerId: bots[0].id }, 'un invité qui retire un bot', /hôte/);
for (const b of bots.slice(0, 5)) await accept(host, 'room:kick', { playerId: b.id }, 'le retrait d’un bot');
await waitFor('cinq joueurs assis', () => seatedCount(host.view) === 5);
await refuse(host, 'room:settings', { custom: ['tanneur', 'tanneur'] }, 'deux Tanneurs', /boîte/);
await accept(host, 'room:settings', { scenario: 'mesure', custom: CUSTOM.slice(1), talk: 'oral', pace: 'normale' }, 'une composition sur mesure');
await waitFor('la composition incomplète', () => host.view.settings.scenario === 'mesure' && host.view.settings.custom.length === 7);
await refuse(host, 'game:start', {}, 'une composition incomplète', /manque/);
await accept(host, 'room:settings', { custom: CUSTOM }, 'la composition complète');
await waitFor('la composition complète', () => host.view.settings.custom.length === 8);
await startGame('partie 3', { ready: true, voteNow: false }, [host, bob, chloe, dora]);
if (!same(host.view.game.roles, sortRoles(CUSTOM))) fail(`composition sur mesure : ${host.view.game.roles}`);
await finishGame('partie 3', members);

// ───────────────────────────── Partie 4 : au hasard, à 6 ─────────────────────────────

await backToLobby(members);
if (host.view.players.find((p) => p.id === ids.eli).status !== 'lobby') fail('Eli devrait s’asseoir à la revanche');
eli.player = true;
await accept(host, 'room:settings', { scenario: 'hasard' }, 'les cartes au hasard');
await waitFor('le hasard', () => host.view.settings.scenario === 'hasard');
await startGame('partie 4', { ready: true, voteNow: false }, [host, bob, chloe, dora, eli]);
await finishGame('partie 4', members);

// ───────────────────────────── Partie 5 : rien que des humains, chacun vote pour son voisin ─────────────────────────────

await backToLobby(members);
const lastBot = host.view.players.find((p) => p.isBot);
await accept(host, 'room:kick', { playerId: lastBot.id }, 'le retrait du dernier bot');
await accept(host, 'room:settings', { scenario: 'premiere' }, 'le retour à « Première nuit »');
await waitFor('une table de cinq humains', () => seatedCount(host.view) === 5 && !host.view.players.some((p) => p.isBot) && host.view.settings.scenario === 'premiere');
await startGame('partie 5', { ready: true, voteNow: false, neighbour: true }, members);
await finishGame('partie 5', members);
if (!results.at(-1).final.outcome.noDeath) fail('partie 5 : une voix chacun, et pourtant quelqu’un meurt');

// ───────────────────────────── Partie 6 : arrêtée par l'hôte pendant la distribution ─────────────────────────────

await backToLobby(members);
for (const c of members) c.player = false;
// Le lancement mélange les places : on compare les victoires joueur par joueur.
const winsById = (v) => JSON.stringify(v.players.map((p) => [p.id, p.wins]).sort());
const winsBefore6 = winsById(host.view);
await accept(host, 'game:start', {}, 'le lancement de la partie 6');
await waitFor('la distribution de la partie 6', () => members.every((c) => c.view?.game?.stage === 'deal'));
await refuse(bob, 'game:end', {}, 'un invité qui arrête la partie', /hôte/);
await accept(host, 'game:end', {}, "l'arrêt de la partie");
await waitFor('le salon après l’arrêt', () => members.every((c) => c.view?.phase === 'lobby' && !c.view.game && !c.view.final));
if (winsById(host.view) !== winsBefore6) fail('une partie arrêtée a compté des victoires');

// ───────────────────────────── Bilan ─────────────────────────────

if (serverErrors.length) fail(`le serveur a signalé des erreurs : ${serverErrors.join(' ')}`);
const TEAM = { village: 'le village', meute: 'la meute', tanneur: 'le Tanneur' };
for (const { label, final, settings } of results) {
  const name = (id) => final.players.find((p) => p.id === id).name;
  const o = final.outcome;
  const deaths = o.noDeath ? 'personne ne meurt' : `${o.dead.map(name).join(', ')} ${o.dead.length > 1 ? 'meurent' : 'meurt'}${o.shots.length ? ` (dont ${o.shots.map((s) => name(s.target)).join(', ')} abattu par le Chasseur)` : ''}`;
  const teams = [...new Set(o.winners.map((id) => final.players.find((p) => p.id === id).team))].map((t) => TEAM[t]);
  const winners = o.winners.length ? `${teams.join(' et ')} ${teams.length > 1 ? 'gagnent' : 'gagne'} (${o.winners.map(name).join(', ')})` : 'personne ne gagne';
  console.log(`✓ ${label} (${final.players.length} joueurs, ${settings.scenario}, débat ${settings.talk === 'oral' ? 'à voix haute' : 'par écrit'}) : ${deaths} ; ${winners}.`);
}
console.log('✓ partie 6 : arrêtée par l’hôte pendant la distribution, retour au salon sans victoire comptée.');
console.log(
  `  Humains : ${stats.seen} cartes vues (${stats.dealIdle} laissées au temps), ${stats.acts} gestes de nuit (${stats.nightIdle} laissés à l'appli, ${stats.nightLate} trop tard), ` +
    `${stats.claims} annonces, ${stats.says} messages, ${stats.ready} « prêt » (${stats.readyToggles} hésitations), ${stats.voteNow} passage(s) au vote par l'hôte, ` +
    `${stats.votes} votes (${stats.changes} changements d'avis, ${stats.lateVotes} trop tard), ${stats.resumes} reprise(s) de session.`,
);
console.log(
  `  Contrôles : ${stats.refused} gestes interdits refusés, ${stats.quiet} silences vérifiés après refus, ${stats.events} réveils de nuit rejoués, ` +
    `${stats.visions} réveils d'humains comparés au récit ; ${stats.states} états audités en ${((Date.now() - started) / 1000).toFixed(1)} s.`,
);
over = true;
for (const c of [host, bob, chloe, dora, eli]) c.socket.close();
server.kill();
process.exit(0);
