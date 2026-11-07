import { describe, expect, it } from 'vitest';
import { BOX, ROLES, SCENARIO_IDS, type Claim, type Role } from '../shared/protocol';
import { claimText, compositionProblem, countOf, leftOf, nightSteps, randomComposition, recipeFor, resolveVote, scenarioOf } from '../shared/roles';
import { botClaim, botNight, botVote, mindOf, type BotInput } from '../server/bots';
import { Game } from '../server/game';

const P = ['a', 'b', 'c', 'd', 'e'];

/** Une partie à donne fixée : les cartes des joueurs dans l'ordre, puis les trois du centre. */
function game(deal: Role[], order = P.slice(0, deal.length - 3)): Game {
  return new Game(order, deal, () => 0.42, deal);
}

/** Avance jusqu'à l'étape voulue (incluse) ; les gestes oubliés sont faits par l'appli. */
function goTo(g: Game, step: string): void {
  if (g.stage === 'deal') g.startNight();
  while (g.currentStep !== step) {
    g.nextStep();
    if (g.dawn) throw new Error(`étape ${step} absente`);
  }
}

function toDawn(g: Game): void {
  if (g.stage === 'deal') g.startNight();
  while (!g.dawn) g.nextStep();
}

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('scénarios', () => {
  it('chaque scénario donne n + 3 cartes, tirées de la boîte, avec au moins un Loup-Garou', () => {
    for (const id of SCENARIO_IDS) {
      if (id === 'hasard' || id === 'mesure') continue;
      const sc = scenarioOf(id);
      for (let n = sc.min; n <= sc.max; n++) {
        const roles = recipeFor(id, n);
        expect(roles, `${id} à ${n}`).not.toBeNull();
        expect(compositionProblem(roles!, n), `${id} à ${n}`).toBeNull();
      }
      expect(recipeFor(id, sc.min - 1)).toBeNull();
      expect(recipeFor(id, sc.max + 1)).toBeNull();
    }
  });

  it('le hasard respecte la boîte et met toujours un Loup-Garou', () => {
    const rnd = seeded(7);
    for (let n = 3; n <= 10; n++)
      for (let i = 0; i < 40; i++) {
        const roles = randomComposition(n, rnd);
        expect(compositionProblem(roles, n)).toBeNull();
      }
  });

  it('refuse une composition qui ne va pas', () => {
    expect(compositionProblem(['voyante', 'voleur', 'noiseuse', 'villageois', 'villageois', 'villageois'], 3)).toMatch(/Loup-Garou/);
    expect(compositionProblem(['loup', 'loup', 'voyante'], 3)).toMatch(/manque 3/);
    expect(compositionProblem(['loup', 'loup', 'loup', 'voyante', 'voleur', 'noiseuse'], 3)).toMatch(/boîte/);
  });

  it('appelle tous les rôles en jeu, même ceux du centre, dans l’ordre du livret', () => {
    expect(nightSteps(['loup', 'loup', 'voyante', 'voleur', 'noiseuse', 'villageois'])).toEqual(['loups', 'voyante', 'voleur', 'noiseuse']);
    const all = ROLES.flatMap((r) => Array.from({ length: BOX[r] }, () => r));
    expect(nightSteps(all)).toEqual(['doppel', 'loups', 'sbire', 'macons', 'voyante', 'voleur', 'noiseuse', 'soulard', 'insomniaque', 'doppel-insomniaque']);
  });
});

describe('la nuit', () => {
  it('les Loups-Garous se reconnaissent ; un Loup seul peut regarder le centre', () => {
    const g = game(['loup', 'loup', 'voyante', 'voleur', 'noiseuse', 'villageois', 'villageois', 'villageois']);
    goTo(g, 'loups');
    expect(g.awake.get('a')!.seen[0].mates).toEqual(['b']);
    expect(g.awake.get('a')!.ask).toBeNull();
    const h = game(['loup', 'voyante', 'voleur', 'loup', 'noiseuse', 'villageois']);
    goTo(h, 'loups');
    expect(h.awake.get('a')!.ask).toBe('peek');
    expect(h.act('a', { center: [0] })).toBeUndefined();
    expect(h.awake.get('a')!.seen[1].cards[0].role).toBe('loup');
    expect(h.act('a', { center: [1] })).toBeTruthy();
  });

  it('le Sbire voit les Loups-Garous, qui ne le voient pas', () => {
    const g = game(['loup', 'sbire', 'loup', 'voyante', 'voleur', 'noiseuse', 'villageois', 'villageois']);
    goTo(g, 'loups');
    expect(g.awake.get('a')!.seen[0].mates).toEqual(['c']);
    goTo(g, 'sbire');
    expect(g.awake.get('b')!.seen[0].mates).toEqual(['a', 'c']);
  });

  it('un Franc-Maçon seul sait que l’autre est au centre', () => {
    const g = game(['macon', 'loup', 'voyante', 'villageois', 'voleur', 'macon', 'loup', 'noiseuse']);
    goTo(g, 'macons');
    expect(g.awake.get('a')!.seen[0].mates).toEqual([]);
  });

  it('la Voyante regarde un joueur ou deux cartes du centre, jamais une seule ni soi-même', () => {
    const g = game(['voyante', 'loup', 'voleur', 'noiseuse', 'villageois', 'loup', 'villageois', 'villageois']);
    goTo(g, 'voyante');
    expect(g.act('a', { center: [0] })).toBeTruthy();
    expect(g.act('a', { players: ['a'] })).toBeTruthy();
    expect(g.act('a', { players: ['b'] })).toBeUndefined();
    expect(g.awake.get('a')!.seen[0].cards[0]).toEqual({ place: { player: 'b' }, role: 'loup' });
    expect(g.act('a', { players: ['c'] })).toBeTruthy();
  });

  it('le Voleur échange et découvre sa nouvelle carte ; il change d’équipe', () => {
    const g = game(['voleur', 'loup', 'voyante', 'noiseuse', 'villageois', 'loup', 'villageois', 'villageois']);
    goTo(g, 'voleur');
    expect(g.act('a', { players: ['b'] })).toBeUndefined();
    expect(g.awake.get('a')!.seen[0].cards[0].role).toBe('loup');
    expect(g.roleOf('a')).toBe('loup');
    expect(g.roleOf('b')).toBe('voleur');
  });

  it('la Noiseuse échange deux autres joueurs, le Soûlard prend une carte du centre sans la voir', () => {
    const g = game(['noiseuse', 'soulard', 'loup', 'voyante', 'villageois', 'loup', 'voleur', 'villageois']);
    goTo(g, 'noiseuse');
    expect(g.act('a', { players: ['a', 'b'] })).toBeTruthy();
    expect(g.act('a', { players: ['c', 'd'] })).toBeUndefined();
    expect(g.roleOf('c')).toBe('voyante');
    expect(g.roleOf('d')).toBe('loup');
    expect(g.awake.get('a')!.seen[0].cards).toEqual([]);
    goTo(g, 'soulard');
    expect(g.act('b', { center: [0] })).toBeUndefined();
    expect(g.roleOf('b')).toBe('loup');
    expect(g.awake.get('b')!.seen[0].cards).toEqual([]);
    expect(g.center[0].role).toBe('soulard');
  });

  it('les gestes obligatoires oubliés sont faits au hasard ; regarder reste facultatif', () => {
    const g = game(['voleur', 'voyante', 'loup', 'noiseuse', 'villageois', 'loup', 'villageois', 'villageois']);
    toDawn(g);
    expect(g.events.filter((e) => e.actor === 'b')).toEqual([]);
    const rob = g.events.find((e) => e.actor === 'a')!;
    expect(rob.auto).toBe(true);
    expect(rob.vision.swap).toBeTruthy();
    expect(g.events.find((e) => e.actor === 'd')!.auto).toBe(true);
  });

  it('l’Insomniaque voit sa carte à la toute fin', () => {
    const g = game(['insomniaque', 'voleur', 'loup', 'voyante', 'villageois', 'loup', 'noiseuse', 'villageois']);
    goTo(g, 'voleur');
    g.act('b', { players: ['a'] });
    goTo(g, 'insomniaque');
    expect(g.awake.get('a')!.seen[0].cards[0].role).toBe('voleur');
  });

  it('le Doppelgänger copie : il agit aussitôt (Voleur), et la carte volée garde la copie', () => {
    const g = game(['doppel', 'voleur', 'loup', 'voyante', 'noiseuse', 'loup', 'villageois', 'villageois']);
    goTo(g, 'doppel');
    expect(g.act('a', { players: ['b'] })).toBeUndefined();
    expect(g.awake.get('a')!.ask).toBe('rob');
    expect(g.act('a', { players: ['c'] })).toBeUndefined();
    expect(g.roleOf('a')).toBe('loup');
    // c tient maintenant la carte Doppelgänger, qui vaut Voleur.
    expect(g.roleOf('c')).toBe('voleur');
    // c avait reçu un Loup-Garou : il se réveille quand même avec les Loups.
    goTo(g, 'loups');
    expect(g.awake.has('c')).toBe(true);
    expect(g.awake.has('a')).toBe(false);
  });

  it('le Doppelgänger qui copie un Loup-Garou se réveille avec eux ; qui copie le Sbire voit les Loups aussitôt', () => {
    const g = game(['doppel', 'loup', 'voyante', 'voleur', 'noiseuse', 'loup', 'villageois', 'villageois']);
    goTo(g, 'doppel');
    g.act('a', { players: ['b'] });
    expect(g.awake.get('a')!.ask).toBeNull();
    goTo(g, 'loups');
    expect(g.awake.get('a')!.seen[0].mates).toEqual(['b']);
    expect(g.awake.get('b')!.ask).toBeNull();
    const h = game(['doppel', 'sbire', 'loup', 'voyante', 'voleur', 'loup', 'villageois', 'villageois']);
    goTo(h, 'doppel');
    h.act('a', { players: ['b'] });
    expect(h.awake.get('a')!.seen[1].mates).toEqual(['c']);
  });

  it('une carte Doppelgänger regardée la nuit montre « Doppelgänger », pas la copie', () => {
    const g = game(['doppel', 'villageois', 'voyante', 'loup', 'voleur', 'loup', 'noiseuse', 'villageois']);
    goTo(g, 'doppel');
    g.act('a', { players: ['b'] });
    goTo(g, 'voyante');
    g.act('c', { players: ['a'] });
    expect(g.awake.get('c')!.seen[0].cards[0].role).toBe('doppel');
    expect(g.roleOf('a')).toBe('villageois');
  });

  it('le Doppelgänger qui copie l’Insomniaque se réveille après elle', () => {
    const g = game(['doppel', 'insomniaque', 'loup', 'voyante', 'voleur', 'loup', 'noiseuse', 'villageois']);
    goTo(g, 'doppel');
    g.act('a', { players: ['b'] });
    goTo(g, 'doppel-insomniaque');
    expect(g.awake.get('a')!.seen[0].cards[0].role).toBe('doppel');
  });
});

describe('le vote', () => {
  const roles = (r: Record<string, Role>) => r;

  it('le plus de voix meurt ; à égalité, tous les ex æquo', () => {
    const order = ['a', 'b', 'c', 'd'];
    const r = roles({ a: 'loup', b: 'villageois', c: 'voyante', d: 'voleur' });
    const o = resolveVote(order, { a: 'b', b: 'a', c: 'a', d: 'b' }, r);
    expect(o.killed).toEqual(['a', 'b']);
    expect(o.village).toBe(true);
    expect(o.winners).toEqual(['b', 'c', 'd']);
  });

  it('si chacun reçoit une voix, personne ne meurt', () => {
    const order = ['a', 'b', 'c'];
    const o = resolveVote(order, { a: 'b', b: 'c', c: 'a' }, roles({ a: 'loup', b: 'villageois', c: 'voyante' }));
    expect(o.noDeath).toBe(true);
    expect(o.dead).toEqual([]);
    expect(o.meute).toBe(true);
    expect(o.winners).toEqual(['a']);
  });

  it('sans Loup-Garou parmi les joueurs, le village gagne si personne ne meurt', () => {
    const order = ['a', 'b', 'c'];
    const r = roles({ a: 'villageois', b: 'voyante', c: 'voleur' });
    expect(resolveVote(order, { a: 'b', b: 'c', c: 'a' }, r).winners).toEqual(['a', 'b', 'c']);
    const o = resolveVote(order, { a: 'b', b: 'a', c: 'b' }, r);
    expect(o.village).toBe(false);
    expect(o.winners).toEqual([]);
  });

  it('le Chasseur emporte sa cible', () => {
    const order = ['a', 'b', 'c', 'd'];
    const o = resolveVote(order, { a: 'b', b: 'd', c: 'b', d: 'a' }, roles({ a: 'loup', b: 'chasseur', c: 'voyante', d: 'villageois' }));
    expect(o.killed).toEqual(['b']);
    expect(o.shots).toEqual([{ by: 'b', target: 'd' }]);
    expect(o.village).toBe(false);
    const o2 = resolveVote(order, { a: 'b', b: 'a', c: 'b', d: 'c' }, roles({ a: 'loup', b: 'chasseur', c: 'voyante', d: 'villageois' }));
    expect(o2.dead).toEqual(['b', 'a']);
    expect(o2.village).toBe(true);
  });

  it('le Tanneur gagne seul s’il meurt sans Loup ; avec un Loup, il gagne avec le village', () => {
    const order = ['a', 'b', 'c', 'd'];
    const r = roles({ a: 'loup', b: 'tanneur', c: 'voyante', d: 'villageois' });
    const o = resolveVote(order, { a: 'b', b: 'c', c: 'b', d: 'a' }, r);
    expect(o.winners).toEqual(['b']);
    expect(o.meute).toBe(false);
    const o2 = resolveVote(order, { a: 'b', b: 'a', c: 'b', d: 'a' }, r);
    expect(o2.dead).toEqual(['a', 'b']);
    expect(o2.winners).toEqual(['b', 'c', 'd']);
  });

  it('le Sbire gagne avec la meute même mort ; sans Loup, il doit survivre et voir mourir le village', () => {
    const order = ['a', 'b', 'c', 'd'];
    const withWolf = resolveVote(order, { a: 'b', b: 'c', c: 'b', d: 'b' }, roles({ a: 'loup', b: 'sbire', c: 'voyante', d: 'villageois' }));
    expect(withWolf.winners).toEqual(['a', 'b']);
    const r = roles({ a: 'villageois', b: 'sbire', c: 'voyante', d: 'villageois' });
    expect(resolveVote(order, { a: 'c', b: 'c', c: 'a', d: 'c' }, r).winners).toEqual(['b']);
    expect(resolveVote(order, { a: 'b', b: 'c', c: 'b', d: 'b' }, r).winners).toEqual(['a', 'c', 'd']);
  });

  it('la partie complète : votes au hasard pour les absents, et la carte de la fin compte', () => {
    const g = game(['voleur', 'loup', 'voyante', 'villageois', 'villageois', 'loup', 'noiseuse', 'insomniaque']);
    goTo(g, 'voleur');
    g.act('a', { players: ['b'] });
    toDawn(g);
    g.startDay();
    g.startVote();
    expect(g.vote('a', 'a')).toBeTruthy();
    g.vote('b', 'a');
    g.vote('c', 'a');
    g.vote('d', 'a');
    const o = g.finish();
    expect(g.autoVotes.has('a')).toBe(true);
    expect(o.killed).toEqual(['a']);
    expect(o.village).toBe(true);
    expect(o.winners).not.toContain('a');
  });
});

describe('les annonces', () => {
  it('ne garde que le détail qui va avec le rôle', () => {
    const g = game(['voyante', 'loup', 'voleur', 'noiseuse', 'villageois', 'loup', 'villageois', 'villageois']);
    g.startDay();
    expect(g.claim('a', { kind: 'role', role: 'voyante', players: ['b'], saw: ['loup'] })).toBeUndefined();
    expect(g.claim('b', { kind: 'role', role: 'soulard' })).toBeTruthy();
    expect(g.claim('b', { kind: 'role', role: 'villageois', players: ['c'], center: [1] })).toBeUndefined();
    expect(g.claims[1]).toEqual({ n: 2, by: 'b', kind: 'role', role: 'villageois' });
    expect(g.claim('c', { kind: 'suspect', players: ['c'] })).toBeTruthy();
    expect(g.claim('c', { kind: 'suspect', players: ['b'] })).toBeUndefined();
    const name = (id: string) => ({ a: 'Alex', b: 'Léo', c: 'Mila' })[id] ?? id;
    expect(claimText(g.claims[0], name)).toBe('Je suis Voyante. J’ai vu la carte de Léo : Loup-Garou.');
    expect(claimText({ n: 1, by: 'c', kind: 'role', role: 'noiseuse', players: ['a', 'b'] }, name)).toBe('Je suis Noiseuse. J’ai échangé les cartes d’Alex et de Léo.');
  });
});

describe('les bots', () => {
  function input(g: Game, id: string): BotInput {
    const c = g.startHand.get(id)!;
    return { me: id, order: g.order, roles: g.roles, dealt: c.role, copy: c.copy, visions: g.visions.get(id)!, claims: g.claims };
  }

  it('la Voyante qui a vu un Loup-Garou vote pour lui ; le Loup ment', () => {
    const g = game(['voyante', 'loup', 'voleur', 'noiseuse', 'villageois', 'loup', 'villageois', 'villageois']);
    goTo(g, 'voyante');
    g.act('a', { players: ['b'] });
    goTo(g, 'voleur');
    g.act('c', { players: ['e'] });
    goTo(g, 'noiseuse');
    g.act('d', { players: ['c', 'e'] });
    toDawn(g);
    g.startDay();
    const rnd = seeded(3);
    for (let i = 0; i < 30; i++) {
      expect(botVote(input(g, 'a'), 'habile', rnd)).toBe('b');
      const lie = botClaim(input(g, 'b'), 'habile', rnd);
      expect(lie.role).not.toBe('loup');
      expect(g.roles).toContain(lie.role);
    }
    const truth = botClaim(input(g, 'a'), 'habile', rnd);
    expect(truth).toEqual({ kind: 'role', role: 'voyante', players: ['b'], saw: ['loup'] });
  });

  it('le Voleur qui a volé un Loup-Garou se sait Loup, et ment', () => {
    const g = game(['voleur', 'loup', 'voyante', 'noiseuse', 'villageois', 'loup', 'villageois', 'villageois']);
    goTo(g, 'voleur');
    g.act('a', { players: ['b'] });
    toDawn(g);
    g.startDay();
    const mind = mindOf(input(g, 'a'), 'habile');
    expect(mind.myRole).toBe('loup');
    expect(mind.team).toBe('meute');
    const lie = botClaim(input(g, 'a'), 'habile', seeded(5));
    expect(lie).toEqual({ kind: 'role', role: 'voleur', players: ['b'], saw: ['villageois'] });
  });

  it('suit les échanges annoncés : la Voyante sait où est passé le Loup-Garou', () => {
    const g = game(['voyante', 'loup', 'noiseuse', 'villageois', 'voleur', 'loup', 'villageois', 'villageois']);
    goTo(g, 'voyante');
    g.act('a', { players: ['b'] });
    goTo(g, 'noiseuse');
    g.act('c', { players: ['b', 'd'] });
    toDawn(g);
    g.startDay();
    g.claim('c', { kind: 'role', role: 'noiseuse', players: ['b', 'd'] });
    const rnd = seeded(11);
    for (let i = 0; i < 20; i++) expect(botVote(input(g, 'a'), 'retors', rnd)).toBe('d');
  });

  it('sûrs qu’aucun Loup-Garou n’est parmi eux, ils votent pour leur voisin', () => {
    const g = game(['voyante', 'villageois', 'voleur', 'noiseuse', 'villageois', 'loup', 'loup', 'villageois']);
    goTo(g, 'voyante');
    g.act('a', { center: [0, 1] });
    toDawn(g);
    g.startDay();
    expect(mindOf(input(g, 'a'), 'habile').noWolf).toBe(true);
    expect(botVote(input(g, 'a'), 'habile', seeded(1))).toBe(leftOf(g.order, 'a'));
  });

  it('la nuit, leurs choix sont toujours acceptés', () => {
    const rnd = seeded(9);
    for (let i = 0; i < 60; i++) {
      const roles = randomComposition(5 + (i % 6), rnd);
      const order = Array.from({ length: roles.length - 3 }, (_, k) => `p${k}`);
      const g = new Game(order, roles, rnd);
      g.startNight();
      while (!g.dawn) {
        g.nextStep();
        for (const [id, a] of g.awake) {
          let guard = 0;
          while (a.ask && guard++ < 3) {
            const c = g.startHand.get(id)!;
            const pick = botNight({ me: id, order, roles: g.roles, dealt: c.role, copy: c.copy, visions: g.visions.get(id)!, claims: [] }, a.ask, 'habile', rnd);
            expect(g.act(id, pick, true)).toBeUndefined();
          }
        }
      }
      g.startDay();
      for (const id of order) {
        const c = g.startHand.get(id)!;
        const claim = botClaim({ me: id, order, roles: g.roles, dealt: c.role, copy: c.copy, visions: g.visions.get(id)!, claims: g.claims }, 'retors', rnd);
        expect(g.claim(id, claim as unknown as Record<string, unknown>)).toBeUndefined();
      }
      g.startVote();
      for (const id of order) {
        const c = g.startHand.get(id)!;
        expect(g.vote(id, botVote({ me: id, order, roles: g.roles, dealt: c.role, copy: c.copy, visions: g.visions.get(id)!, claims: g.claims }, 'habile', rnd))).toBeUndefined();
      }
      const o = g.finish();
      expect(countOf(g.order.map((id) => g.roleOf(id)), 'loup')).toBe(o.wolves.length);
    }
  });

  it('les claims d’un rôle sont tous lisibles', () => {
    const name = (id: string) => id.toUpperCase();
    const samples: Claim[] = [
      { n: 1, by: 'a', kind: 'role', role: 'voyante', center: [0, 2], saw: ['villageois', 'noiseuse'] },
      { n: 2, by: 'a', kind: 'role', role: 'insomniaque', saw: ['insomniaque'] },
      { n: 3, by: 'a', kind: 'role', role: 'macon', alone: true },
      { n: 4, by: 'a', kind: 'role', role: 'loup', alone: true, center: [1], saw: ['voyante'] },
      { n: 5, by: 'a', kind: 'noWolf' },
    ];
    for (const c of samples) expect(claimText(c, name)).toMatch(/\.$/);
  });
});
