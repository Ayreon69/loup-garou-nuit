// Les rôles, les scénarios, la voix du narrateur, le texte des annonces et la résolution du vote.
// Partagé : le serveur s'en sert pour jouer, le client pour expliquer (règles, tutoriel, dévoilement).
import { BOX, CENTER, ROLES, STEPS, type Ask, type Claim, type Outcome, type Role, type ScenarioId, type StepId, type Team } from './protocol';

export interface RoleInfo {
  name: string;
  plural: string;
  /** « la Voyante », « le Voleur », « l’Insomniaque ». */
  the: string;
  team: Team;
  /** Numéro de réveil (comme sur les cartes) ; null : dort toute la nuit. */
  wake: number | null;
  /** En une ligne. */
  short: string;
  /** Ce qu'il fait la nuit. */
  night: string;
  /** Comment il gagne. */
  goal: string;
  tip: string;
  /** Difficulté, de 1 à 3. */
  level: 1 | 2 | 3;
}

const VILLAGE_GOAL = 'Le village gagne si au moins un Loup-Garou meurt. S’il n’y a aucun Loup-Garou parmi les joueurs, il gagne si personne du village ne meurt.';

export const ROLE_INFO: Record<Role, RoleInfo> = {
  doppel: {
    name: 'Doppelgänger',
    plural: 'Doppelgängers',
    the: 'le Doppelgänger',
    team: 'village',
    wake: 1,
    short: 'Copie le rôle d’un autre joueur.',
    night:
      'Se réveille en premier et regarde la carte d’un autre joueur : il devient ce rôle et rejoint son équipe. Voyante, Voleur, Noiseuse ou Soûlard : il agit aussitôt. Loup-Garou, Franc-Maçon ou Insomniaque : il se réveille avec eux. Sbire : il voit aussitôt les Loups-Garous.',
    goal: 'Gagne avec l’équipe du rôle copié. Le joueur qui finit avec sa carte prend le rôle copié.',
    tip: 'Rôle avancé : à garder pour quand tout le monde connaît les autres.',
    level: 3,
  },
  loup: {
    name: 'Loup-Garou',
    plural: 'Loups-Garous',
    the: 'le Loup-Garou',
    team: 'meute',
    wake: 2,
    short: 'Se cache parmi le village.',
    night: 'Les Loups-Garous se réveillent et se reconnaissent. Un Loup-Garou seul peut regarder une carte du centre.',
    goal: 'La meute gagne si aucun Loup-Garou ne meurt.',
    tip: 'Au matin, fais-toi passer pour un autre rôle. Seul, annonce la carte vue au centre : personne ne pourra te contredire.',
    level: 1,
  },
  sbire: {
    name: 'Sbire',
    plural: 'Sbires',
    the: 'le Sbire',
    team: 'meute',
    wake: 3,
    short: 'Sert les Loups-Garous, qui ne le connaissent pas.',
    night: 'Les Loups-Garous lèvent le pouce, les yeux fermés : le Sbire voit qui ils sont. Eux ne savent pas qui il est.',
    goal: 'Gagne avec la meute, même s’il meurt. Sans Loup-Garou parmi les joueurs, il gagne si un joueur du village meurt, et pas lui.',
    tip: 'Attire les soupçons sur toi ou sur un innocent : tu gagnes même mort.',
    level: 2,
  },
  macon: {
    name: 'Franc-Maçon',
    plural: 'Francs-Maçons',
    the: 'le Franc-Maçon',
    team: 'village',
    wake: 4,
    short: 'Connaît l’autre Franc-Maçon.',
    night: 'Les Francs-Maçons se réveillent et se reconnaissent. Seul réveillé ? L’autre carte est au centre.',
    goal: VILLAGE_GOAL,
    tip: 'Deux Francs-Maçons se servent d’alibi. Un troisième qui se dit Franc-Maçon ment forcément !',
    level: 1,
  },
  voyante: {
    name: 'Voyante',
    plural: 'Voyantes',
    the: 'la Voyante',
    team: 'village',
    wake: 5,
    short: 'Regarde une carte d’un joueur, ou deux au centre.',
    night: 'Regarde la carte d’un autre joueur, ou deux cartes du centre.',
    goal: VILLAGE_GOAL,
    tip: 'Dis vite ce que tu as vu : c’est l’information la plus précieuse du village. Mais la carte a pu changer après toi !',
    level: 1,
  },
  voleur: {
    name: 'Voleur',
    plural: 'Voleurs',
    the: 'le Voleur',
    team: 'village',
    wake: 6,
    short: 'Vole la carte d’un autre joueur.',
    night: 'Échange sa carte avec celle d’un autre joueur, puis regarde sa nouvelle carte. Il devient ce rôle (et change d’équipe s’il le faut), sans en faire l’action.',
    goal: 'Gagne avec l’équipe de sa nouvelle carte.',
    tip: 'Si tu as volé un Loup-Garou, tu es devenu Loup : à toi de mentir ! Et le joueur volé est devenu Voleur sans le savoir.',
    level: 1,
  },
  noiseuse: {
    name: 'Noiseuse',
    plural: 'Noiseuses',
    the: 'la Noiseuse',
    team: 'village',
    wake: 7,
    short: 'Échange les cartes de deux autres joueurs.',
    night: 'Échange les cartes de deux autres joueurs, sans les regarder.',
    goal: VILLAGE_GOAL,
    tip: 'Les deux joueurs échangés ne le savent pas : dis-le au matin, ça change tout.',
    level: 1,
  },
  soulard: {
    name: 'Soûlard',
    plural: 'Soûlards',
    the: 'le Soûlard',
    team: 'village',
    wake: 8,
    short: 'Échange sa carte avec le centre, sans la regarder.',
    night: 'Échange sa carte avec une carte du centre, sans la regarder. Il ne sait plus qui il est.',
    goal: 'Gagne avec l’équipe de sa nouvelle carte… qu’il ne connaît pas.',
    tip: 'Tu es peut-être devenu Loup-Garou sans le savoir. Écoute bien les autres.',
    level: 2,
  },
  insomniaque: {
    name: 'Insomniaque',
    plural: 'Insomniaques',
    the: 'l’Insomniaque',
    team: 'village',
    wake: 9,
    short: 'Regarde sa propre carte à la fin de la nuit.',
    night: 'Se réveille en dernier et regarde sa propre carte, pour savoir si elle a changé.',
    goal: 'Gagne avec l’équipe de la carte qu’elle découvre.',
    tip: 'Si ta carte a changé, quelqu’un l’a volée ou échangée : précieux pour démasquer les menteurs.',
    level: 2,
  },
  villageois: {
    name: 'Villageois',
    plural: 'Villageois',
    the: 'le Villageois',
    team: 'village',
    wake: null,
    short: 'Dort toute la nuit.',
    night: 'Dort toute la nuit : aucune action.',
    goal: VILLAGE_GOAL,
    tip: 'Tu n’as rien vu, mais tu peux interroger, comparer les récits et repérer les menteurs.',
    level: 1,
  },
  chasseur: {
    name: 'Chasseur',
    plural: 'Chasseurs',
    the: 'le Chasseur',
    team: 'village',
    wake: null,
    short: 'S’il meurt, sa cible meurt aussi.',
    night: 'Dort toute la nuit. S’il meurt, le joueur qu’il a désigné au vote meurt aussi.',
    goal: VILLAGE_GOAL,
    tip: 'Tu peux te faire tuer exprès en visant un Loup-Garou.',
    level: 2,
  },
  tanneur: {
    name: 'Tanneur',
    plural: 'Tanneurs',
    the: 'le Tanneur',
    team: 'tanneur',
    wake: null,
    short: 'Déteste son métier : il veut mourir.',
    night: 'Dort toute la nuit.',
    goal: 'Gagne seul s’il meurt. S’il meurt, la meute ne peut pas gagner ; si un Loup-Garou meurt aussi, le village gagne avec lui.',
    tip: 'Parais suspect sans en faire trop : si tu exagères, on devinera.',
    level: 3,
  },
};

export const TEAM_INFO: Record<Team, { name: string; short: string }> = {
  village: { name: 'Village', short: 'le village' },
  meute: { name: 'Meute', short: 'la meute' },
  tanneur: { name: 'Tanneur', short: 'le Tanneur' },
};

/** Le rôle d'une carte : pour la carte Doppelgänger, le rôle copié s'il y en a un. */
export function effective(card: { role: Role; copy: Role | null }): Role {
  return card.role === 'doppel' ? (card.copy ?? 'doppel') : card.role;
}

export function teamOf(role: Role): Team {
  if (role === 'loup' || role === 'sbire') return 'meute';
  if (role === 'tanneur') return 'tanneur';
  return 'village';
}

export function countOf(roles: readonly Role[], role: Role): number {
  let n = 0;
  for (const r of roles) if (r === role) n++;
  return n;
}

/** Les rôles dans l'ordre du réveil. */
export function sortRoles(roles: readonly Role[]): Role[] {
  return [...roles].sort((a, b) => ROLES.indexOf(a) - ROLES.indexOf(b));
}

/** Les étapes de la nuit pour une composition : tous les rôles en jeu sont appelés, même ceux du centre, pour ne rien trahir. */
export function nightSteps(roles: readonly Role[]): StepId[] {
  const has = (r: Role) => roles.includes(r);
  return STEPS.filter((s) => {
    if (s === 'loups') return has('loup');
    if (s === 'macons') return has('macon');
    if (s === 'doppel-insomniaque') return has('doppel') && has('insomniaque');
    return has(s);
  });
}

/** Le rôle qu'on appelle à chaque étape. */
export const STEP_ROLE: Record<StepId, Role> = {
  doppel: 'doppel',
  loups: 'loup',
  sbire: 'sbire',
  macons: 'macon',
  voyante: 'voyante',
  voleur: 'voleur',
  noiseuse: 'noiseuse',
  soulard: 'soulard',
  insomniaque: 'insomniaque',
  'doppel-insomniaque': 'doppel',
};

/** La voix du narrateur à chaque étape : le réveil, puis le rendormir. */
export const NARRATION: Record<StepId, { label: string; wake: string; sleep: string }> = {
  doppel: { label: 'Doppelgänger', wake: 'Doppelgänger, réveille-toi. Regarde la carte d’un autre joueur : tu deviens ce rôle.', sleep: 'Doppelgänger, rendors-toi.' },
  loups: {
    label: 'Loups-Garous',
    wake: 'Loups-Garous, réveillez-vous et regardez-vous. Un Loup-Garou seul peut regarder une carte du centre.',
    sleep: 'Loups-Garous, rendormez-vous.',
  },
  sbire: { label: 'Sbire', wake: 'Sbire, réveille-toi. Loups-Garous, levez le pouce : le Sbire vous voit.', sleep: 'Sbire, rendors-toi. Loups-Garous, baissez le pouce.' },
  macons: { label: 'Francs-Maçons', wake: 'Francs-Maçons, réveillez-vous et regardez-vous.', sleep: 'Francs-Maçons, rendormez-vous.' },
  voyante: { label: 'Voyante', wake: 'Voyante, réveille-toi. Regarde la carte d’un autre joueur, ou deux cartes du centre.', sleep: 'Voyante, rendors-toi.' },
  voleur: { label: 'Voleur', wake: 'Voleur, réveille-toi. Échange ta carte avec celle d’un autre joueur, puis regarde-la.', sleep: 'Voleur, rendors-toi.' },
  noiseuse: { label: 'Noiseuse', wake: 'Noiseuse, réveille-toi. Échange les cartes de deux autres joueurs.', sleep: 'Noiseuse, rendors-toi.' },
  soulard: { label: 'Soûlard', wake: 'Soûlard, réveille-toi. Échange ta carte avec une carte du centre, sans la regarder.', sleep: 'Soûlard, rendors-toi.' },
  insomniaque: { label: 'Insomniaque', wake: 'Insomniaque, réveille-toi et regarde ta carte.', sleep: 'Insomniaque, rendors-toi.' },
  'doppel-insomniaque': {
    label: 'Doppel-Insomniaque',
    wake: 'Doppelgänger, si tu as copié l’Insomniaque, réveille-toi et regarde ta carte.',
    sleep: 'Doppelgänger, rendors-toi.',
  },
};

export const DUSK_LINE = 'La nuit tombe sur le village. Tout le monde ferme les yeux.';
export const DAWN_LINE = 'Le jour se lève. Tout le monde ouvre les yeux !';
export const VOTE_LINE = 'Le débat est terminé. Votez !';

/** Chaque réplique du narrateur, sous un nom de fichier : client/public/voix/<nom>.mp3, enregistré une fois pour toutes. */
export function voiceLines(): Record<string, string> {
  const lines: Record<string, string> = { dusk: DUSK_LINE, dawn: DAWN_LINE, vote: VOTE_LINE };
  for (const [step, n] of Object.entries(NARRATION)) {
    lines[`${step}-wake`] = n.wake;
    lines[`${step}-sleep`] = n.sleep;
  }
  return lines;
}

/** Ce qu'on attend d'un rôle réveillé, et l'instruction à l'écran. */
export const ASK_TEXT: Record<Ask, { title: string; hint: string }> = {
  copy: { title: 'Choisis un joueur à copier', hint: 'Touche la carte d’un autre joueur : tu deviens son rôle.' },
  seer: { title: 'Regarde une carte', hint: 'Touche la carte d’un autre joueur, ou deux cartes du centre.' },
  rob: { title: 'Vole une carte', hint: 'Touche la carte d’un autre joueur : vous échangez vos cartes, puis tu découvres la nouvelle.' },
  swap: { title: 'Échange deux cartes', hint: 'Touche les cartes de deux autres joueurs : elles s’échangent, sans que tu les voies.' },
  drunk: { title: 'Prends une carte du centre', hint: 'Touche une carte du centre : elle remplace la tienne, sans que tu la voies.' },
  peek: { title: 'Tu es le seul Loup-Garou', hint: 'Si tu veux, touche une carte du centre pour la regarder.' },
};

// ───────────────────────────── Scénarios ─────────────────────────────

export interface Scenario {
  id: ScenarioId;
  name: string;
  /** Difficulté, de 1 à 4. */
  level: number;
  min: number;
  max: number;
  blurb: string;
}

type Recipe = { base: Role[]; add: Partial<Record<number, Role[]>> };
const r = (...roles: Role[]): Role[] => roles;

/** Les compositions du livret (noms à nous). « Première nuit » est étendue au-delà de 5 joueurs. */
const RECIPES: Partial<Record<ScenarioId, Recipe>> = {
  premiere: {
    base: r('loup', 'loup', 'voyante', 'voleur', 'noiseuse', 'villageois'),
    add: {
      4: r('villageois'),
      5: r('villageois', 'villageois'),
      6: r('insomniaque', 'villageois', 'villageois'),
      7: r('insomniaque', 'macon', 'macon', 'villageois'),
      8: r('insomniaque', 'macon', 'macon', 'chasseur', 'villageois'),
      9: r('insomniaque', 'macon', 'macon', 'chasseur', 'villageois', 'villageois'),
      10: r('insomniaque', 'macon', 'macon', 'chasseur', 'villageois', 'villageois', 'soulard'),
    },
  },
  solitaire: { base: r('loup', 'voyante', 'voleur', 'noiseuse', 'villageois', 'villageois'), add: { 4: r('villageois') } },
  blanche: {
    base: r('loup', 'loup', 'insomniaque', 'voleur', 'noiseuse', 'villageois'),
    add: { 4: r('villageois'), 5: r('villageois', 'voyante'), 6: r('villageois', 'villageois', 'voyante') },
  },
  fusil: {
    base: r('loup', 'loup', 'chasseur', 'voyante', 'voleur', 'soulard', 'insomniaque'),
    add: { 5: r('noiseuse'), 6: r('noiseuse', 'villageois'), 7: r('noiseuse', 'villageois', 'villageois') },
  },
  tanneur: {
    base: r('loup', 'loup', 'tanneur', 'voyante', 'voleur', 'soulard', 'insomniaque'),
    add: {
      5: r('noiseuse'),
      6: r('noiseuse', 'villageois'),
      7: r('noiseuse', 'macon', 'macon'),
      8: r('noiseuse', 'macon', 'macon', 'chasseur'),
      9: r('noiseuse', 'macon', 'macon', 'chasseur', 'sbire'),
      10: r('noiseuse', 'macon', 'macon', 'chasseur', 'sbire', 'villageois'),
    },
  },
  confusion: {
    base: r('loup', 'loup', 'soulard', 'voleur', 'noiseuse', 'insomniaque'),
    add: {
      4: r('villageois'),
      5: r('villageois', 'voyante'),
      6: r('villageois', 'villageois', 'voyante'),
      7: r('villageois', 'villageois', 'villageois', 'voyante'),
      8: r('villageois', 'villageois', 'villageois', 'voyante', 'sbire'),
      9: r('villageois', 'villageois', 'voyante', 'sbire', 'macon', 'macon'),
    },
  },
  complices: { base: r('loup', 'loup', 'sbire', 'chasseur', 'voyante', 'voleur', 'noiseuse', 'macon', 'macon'), add: { 7: r('villageois') } },
  alliance: {
    base: r('loup', 'loup', 'macon', 'macon', 'sbire', 'voleur', 'noiseuse', 'insomniaque'),
    add: {
      6: r('soulard'),
      7: r('soulard', 'voyante'),
      8: r('soulard', 'voyante', 'villageois'),
      9: r('soulard', 'voyante', 'villageois', 'villageois'),
      10: r('soulard', 'voyante', 'villageois', 'villageois', 'tanneur'),
    },
  },
  double: {
    base: r('loup', 'loup', 'doppel', 'sbire', 'chasseur', 'voyante', 'voleur', 'noiseuse', 'villageois', 'macon', 'macon'),
    add: { 9: r('insomniaque'), 10: r('insomniaque', 'soulard') },
  },
};

export const SCENARIOS: Scenario[] = [
  { id: 'premiere', name: 'Première nuit', level: 1, min: 3, max: 10, blurb: 'Les rôles de base : parfait pour découvrir.' },
  { id: 'solitaire', name: 'Loup solitaire', level: 1, min: 3, max: 4, blurb: 'Un seul Loup-Garou… peut-être au centre.' },
  { id: 'blanche', name: 'Nuit blanche', level: 2, min: 3, max: 6, blurb: 'L’Insomniaque veille : qui a touché à sa carte ?' },
  { id: 'fusil', name: 'Coup de fusil', level: 2, min: 4, max: 7, blurb: 'Le Chasseur emporte quelqu’un dans sa chute.' },
  { id: 'confusion', name: 'Chambardement', level: 3, min: 3, max: 9, blurb: 'Soûlard, Voleur et Noiseuse : tout se mélange.' },
  { id: 'tanneur', name: 'Le Tanneur', level: 3, min: 4, max: 10, blurb: 'Quelqu’un veut mourir : ne lui faites pas ce plaisir.' },
  { id: 'complices', name: 'Complices', level: 3, min: 6, max: 7, blurb: 'Le Sbire aide les Loups, les Francs-Maçons s’épaulent.' },
  { id: 'alliance', name: 'Crépuscule', level: 3, min: 5, max: 10, blurb: 'Sbire et Francs-Maçons, sans Voyante pour les petites tables.' },
  { id: 'double', name: 'Le Double', level: 4, min: 8, max: 10, blurb: 'Avec le Doppelgänger, pour joueurs aguerris.' },
  { id: 'hasard', name: 'Au hasard', level: 3, min: 3, max: 10, blurb: 'Cartes tirées au sort, avec au moins un Loup-Garou.' },
  { id: 'mesure', name: 'Sur mesure', level: 2, min: 3, max: 10, blurb: 'Choisis toi-même chaque carte.' },
];

export function scenarioOf(id: ScenarioId): Scenario {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
}

/** La composition d'un scénario pour n joueurs (n + 3 cartes), ou null s'il ne se joue pas à n. Pas pour « Au hasard » ni « Sur mesure ». */
export function recipeFor(id: ScenarioId, n: number): Role[] | null {
  const recipe = RECIPES[id];
  const sc = scenarioOf(id);
  if (!recipe || n < sc.min || n > sc.max) return null;
  return sortRoles([...recipe.base, ...(recipe.add[n] ?? [])]);
}

/** Pourquoi une composition ne convient pas, ou null si elle convient. */
export function compositionProblem(roles: readonly Role[], n: number): string | null {
  const need = n + CENTER;
  for (const role of ROLES) if (countOf(roles, role) > BOX[role]) return `La boîte ne contient que ${BOX[role]} ${BOX[role] > 1 ? ROLE_INFO[role].plural : ROLE_INFO[role].name}.`;
  if (!roles.includes('loup')) return 'Il faut au moins un Loup-Garou.';
  if (roles.length < need) return `Il manque ${need - roles.length} carte${need - roles.length > 1 ? 's' : ''} : il en faut ${need} (${n} joueurs + 3 au centre).`;
  if (roles.length > need) return `${roles.length - need} carte${roles.length - need > 1 ? 's' : ''} de trop : il en faut ${need} (${n} joueurs + 3 au centre).`;
  return null;
}

/** Une composition tirée au sort dans la boîte, avec au moins un Loup-Garou. */
export function randomComposition(n: number, rnd: () => number = Math.random): Role[] {
  const pool: Role[] = [];
  for (const role of ROLES) for (let i = 0; i < BOX[role]; i++) pool.push(role);
  pool.splice(pool.indexOf('loup'), 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return sortRoles(['loup', ...pool.slice(0, n + CENTER - 1)]);
}

// ───────────────────────────── Annonces ─────────────────────────────

export const CENTER_NAME = ['de gauche', 'du milieu', 'de droite'] as const;

/** « de Léo », « d’Alex ». */
export function de(name: string): string {
  return /^[aeiouyàâäéèêëîïôöùûüœæ]/i.test(name) ? `d’${name}` : `de ${name}`;
}

function andList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
}

/** Le texte d'une annonce, à la première personne. */
export function claimText(c: Claim, name: (id: string) => string): string {
  const who = (c.players ?? []).map(name);
  if (c.kind === 'suspect') return `Je soupçonne ${who[0] ?? 'quelqu’un'}.`;
  if (c.kind === 'noWolf') return 'Je crois qu’aucun Loup-Garou n’est parmi nous : votons chacun pour notre voisin, personne ne mourra.';
  const role = c.role!;
  const n = ROLE_INFO[role].name;
  const saw = (c.saw ?? []).map((x) => ROLE_INFO[x].name);
  const head = `Je suis ${n}.`;
  switch (role) {
    case 'voyante':
      if (who[0] && saw[0]) return `${head} J’ai vu la carte ${de(who[0])} : ${saw[0]}.`;
      if (saw.length === 2) return `${head} J’ai vu deux cartes du centre : ${saw[0]} et ${saw[1]}.`;
      return head;
    case 'voleur':
      if (who[0] && saw[0]) return `${head} J’ai pris la carte ${de(who[0])} : ${saw[0]}.`;
      if (who[0]) return `${head} J’ai pris la carte ${de(who[0])}.`;
      return head;
    case 'noiseuse':
      return who.length === 2 ? `${head} J’ai échangé les cartes ${de(who[0])} et ${de(who[1])}.` : head;
    case 'soulard':
      return c.center?.length ? `${head} J’ai pris la carte ${CENTER_NAME[c.center[0]]} du centre.` : head;
    case 'insomniaque':
      if (!saw[0]) return head;
      return c.saw![0] === 'insomniaque' ? `${head} Au réveil, ma carte n’avait pas changé.` : `${head} Au réveil, ma carte était devenue ${saw[0]}.`;
    case 'macon':
      if (c.alone) return `${head} Personne d’autre ne s’est réveillé : l’autre carte est au centre.`;
      return who[0] ? `${head} L’autre, c’est ${who[0]}.` : head;
    case 'doppel':
      return who[0] && saw[0] ? `${head} J’ai copié la carte ${de(who[0])} : ${saw[0]}.` : head;
    case 'loup':
      if (c.alone && saw[0]) return `${head} Aucun autre Loup-Garou avec moi ; au centre, j’ai vu : ${saw[0]}.`;
      if (c.alone) return `${head} Aucun autre Loup-Garou avec moi.`;
      return who.length ? `${head} Avec ${andList(who)}.` : head;
    case 'sbire':
      if (c.alone) return `${head} Je n’ai vu aucun Loup-Garou.`;
      return who.length ? `${head} J’ai vu les Loups-Garous : ${andList(who)}.` : head;
    default:
      return head;
  }
}

// ───────────────────────────── Le vote ─────────────────────────────

/**
 * Résout le vote. votes : qui désigne qui. roleOf : le rôle de chacun à la fin (la carte devant lui).
 * Le plus de voix meurt ; à égalité, tous les ex æquo. Si chacun a exactement une voix, personne ne meurt.
 * Un Chasseur qui meurt emporte celui qu'il a désigné.
 */
export function resolveVote(order: readonly string[], votes: Readonly<Record<string, string | null | undefined>>, roleOf: Readonly<Record<string, Role>>): Outcome {
  const counts = new Map<string, number>(order.map((id) => [id, 0]));
  for (const id of order) {
    const t = votes[id];
    if (t && t !== id && counts.has(t)) counts.set(t, counts.get(t)! + 1);
  }
  const max = Math.max(0, ...counts.values());
  const noDeath = max <= 1;
  const killed = noDeath ? [] : order.filter((id) => counts.get(id) === max);
  const dead = [...killed];
  const shots: Outcome['shots'] = [];
  for (let i = 0; i < dead.length; i++) {
    const id = dead[i];
    const t = votes[id];
    if (roleOf[id] === 'chasseur' && t && counts.has(t) && !dead.includes(t)) {
      shots.push({ by: id, target: t });
      dead.push(t);
    }
  }
  const isDead = new Set(dead);
  const wolves = order.filter((id) => roleOf[id] === 'loup');
  const tannerDead = dead.some((id) => roleOf[id] === 'tanneur');
  const wolfDead = dead.some((id) => roleOf[id] === 'loup');
  const villagerDead = dead.some((id) => teamOf(roleOf[id]) === 'village');
  const village = wolves.length ? wolfDead : !villagerDead && !tannerDead;
  const winners = order.filter((id) => {
    const role = roleOf[id];
    const team = teamOf(role);
    if (team === 'tanneur') return isDead.has(id);
    if (team === 'village') return village;
    if (wolves.length) return !wolfDead && !tannerDead;
    // Aucun Loup-Garou parmi les joueurs : le Sbire gagne s'il survit et qu'un joueur du village meurt.
    return role === 'sbire' && !isDead.has(id) && villagerDead && !tannerDead;
  });
  const meute = winners.some((id) => teamOf(roleOf[id]) === 'meute');
  return { noDeath, killed, shots, dead, wolves, village, meute, winners };
}

/** Le voisin de gauche : le joueur suivant dans l'ordre de la table. */
export function leftOf(order: readonly string[], id: string): string {
  const i = order.indexOf(id);
  return order[(i + 1) % order.length];
}
