// Force des bots : des parties complètes entre bots (nuit, annonces, soupçons, vote), comparées à un vote au hasard.
// npx tsx test/sim.ts [parties] [joueurs] [scénario]
import { SCENARIO_IDS, type Role, type ScenarioId } from '../shared/protocol';
import { recipeFor, randomComposition, teamOf } from '../shared/roles';
import { botAccuse, botClaim, botNight, botVote, type BotInput, type Skill } from '../server/bots';
import { Game } from '../server/game';

const games = Number(process.argv[2]) || 300;
const n = Number(process.argv[3]) || 5;
const scenario = (SCENARIO_IDS as readonly string[]).includes(process.argv[4] ?? '') ? (process.argv[4] as ScenarioId) : 'premiere';

function input(g: Game, id: string): BotInput {
  const c = g.startHand.get(id)!;
  return { me: id, order: g.order, roles: g.roles, dealt: c.role, copy: c.copy, visions: g.visions.get(id)!, claims: g.claims };
}

function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

interface Tally {
  village: number;
  meute: number;
  tanneur: number;
  noDeath: number;
  wolfAmong: number;
  wolfKilled: number;
}

function play(skill: Skill, randomVotes: boolean, t: Tally): void {
  const roles: Role[] = recipeFor(scenario, n) ?? randomComposition(n);
  const order = Array.from({ length: n }, (_, i) => `p${i}`);
  const g = new Game(order, roles);
  g.startNight();
  while (!g.dawn) {
    g.nextStep();
    for (const [id, a] of g.awake) {
      let guard = 0;
      while (a.ask && guard++ < 3) g.act(id, botNight(input(g, id), a.ask, skill, Math.random), true);
    }
  }
  g.startDay();
  // La meute parle en dernier : elle écoute avant de mentir.
  const speakers = shuffle(order).sort((a, b) => Number(teamOf(g.dealtAs(a)) !== 'village') - Number(teamOf(g.dealtAs(b)) !== 'village'));
  for (const id of speakers) g.claim(id, botClaim(input(g, id), skill, Math.random) as unknown as Record<string, unknown>);
  for (const id of shuffle(order)) {
    const target = botAccuse(input(g, id), skill, Math.random, []);
    if (target) g.claim(id, { kind: 'suspect', players: [target] });
  }
  g.startVote();
  for (const id of order) {
    const others = order.filter((x) => x !== id);
    g.vote(id, randomVotes ? others[Math.floor(Math.random() * others.length)] : botVote(input(g, id), skill, Math.random));
  }
  const o = g.finish();
  if (o.village) t.village++;
  if (o.meute) t.meute++;
  if (order.some((id) => g.roleOf(id) === 'tanneur' && o.winners.includes(id))) t.tanneur++;
  if (o.noDeath) t.noDeath++;
  if (o.wolves.length) {
    t.wolfAmong++;
    if (o.dead.some((id) => g.roleOf(id) === 'loup')) t.wolfKilled++;
  }
}

const pct = (x: number, of: number) => `${of ? Math.round((100 * x) / of) : 0} %`;
const rows: [string, Skill, boolean][] = [
  ['vote au hasard', 'novice', true],
  ['bots novices', 'novice', false],
  ['bots habiles', 'habile', false],
  ['bots retors', 'retors', false],
];
console.log(`${games} parties à ${n} joueurs, scénario ${scenario}`);
for (const [label, skill, random] of rows) {
  const t: Tally = { village: 0, meute: 0, tanneur: 0, noDeath: 0, wolfAmong: 0, wolfKilled: 0 };
  for (let i = 0; i < games; i++) play(skill, random, t);
  console.log(
    `${label.padEnd(15)} village ${pct(t.village, games)} · meute ${pct(t.meute, games)} · Loup éliminé quand il y en a un ${pct(t.wolfKilled, t.wolfAmong)} · personne ne meurt ${pct(t.noDeath, games)}${t.tanneur ? ` · Tanneur ${pct(t.tanneur, games)}` : ''}`,
  );
}
