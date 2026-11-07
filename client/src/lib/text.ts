// Les mots de la table : noms, cartes, réveils racontés, et « pourquoi ce résultat ».
import type { DaySetting, FinalView, NightEvent, Place, Role, RoomView, Vision } from '../../../shared/protocol';
import { CENTER_NAME, ROLE_INFO, de, teamOf } from '../../../shared/roles';

/** Le nom d'un joueur tel qu'on le lit dans une phrase ; « toi » pour soi. */
export function nameOf(view: RoomView, id: string | undefined | null, me = true): string {
  if (!id) return '?';
  if (me && id === view.me) return 'toi';
  return view.players.find((p) => p.id === id)?.name ?? '?';
}

/** Les vrais noms, pour les annonces (écrites à la première personne par leur auteur). */
export function realName(view: RoomView): (id: string) => string {
  return (id) => view.players.find((p) => p.id === id)?.name ?? '?';
}

export function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** « Léa, Zino et Sam ». */
export function listing(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
}

export const roleName = (r: Role) => ROLE_INFO[r].name;

/** « la carte de Léo », « ta carte », « la carte de gauche du centre ». */
export function placeText(p: Place, name: (id: string) => string, me?: string): string {
  if ('center' in p) return `la carte ${CENTER_NAME[p.center]} du centre`;
  if (p.player === me) return 'ta carte';
  return `la carte ${de(name(p.player))}`;
}

/** Ce que j'ai vu ou fait pendant mon réveil, à la deuxième personne. */
export function visionText(v: Vision, name: (id: string) => string, me: string): string {
  const seen = v.cards.map((c) => `${placeText(c.place, name, me)} : ${roleName(c.role)}`);
  switch (v.as) {
    case 'loup':
      if (v.mates) return v.mates.length ? `Tu te reconnais avec ${listing(v.mates.map(name))}.` : 'Tu es le seul Loup-Garou parmi les joueurs : l’autre carte est au centre, ou il n’y en a qu’une.';
      return `Tu as regardé ${seen[0]}.`;
    case 'sbire':
      return v.mates?.length ? `Les Loups-Garous sont : ${listing(v.mates.map(name))}.` : 'Aucun Loup-Garou parmi les joueurs : ils sont tous au centre.';
    case 'macon':
      return v.mates?.length ? `L’autre Franc-Maçon : ${listing(v.mates.map(name))}.` : 'Personne d’autre : l’autre carte de Franc-Maçon est au centre.';
    case 'insomniaque':
      return v.cards[0]?.role === 'insomniaque' ? 'Ta carte n’a pas changé : tu es toujours Insomniaque.' : `Ta carte a changé : tu es maintenant ${roleName(v.cards[0].role)}.`;
    default:
      break;
  }
  if (v.swap && v.as === 'voleur') return `Tu as échangé ta carte avec ${placeText(v.swap[1], name, me).replace('la carte', 'celle')}. Ta nouvelle carte : ${roleName(v.cards[0].role)}.`;
  if (v.swap && v.as === 'noiseuse') return `Tu as échangé ${placeText(v.swap[0], name, me)} et ${placeText(v.swap[1], name, me)}.`;
  if (v.swap && v.as === 'soulard') return `Tu as échangé ta carte avec ${placeText(v.swap[1], name, me)}, sans la voir.`;
  if (v.as === 'doppel' && v.cards[0]) return `Tu as regardé ${seen[0]}. Tu deviens ${roleName(v.cards[0].role)} !`;
  return `Tu as vu ${listing(seen)}.`;
}

/** Un réveil de la nuit, raconté au matin, à la troisième personne. */
export function eventText(e: NightEvent, name: (id: string) => string): string {
  const v = e.vision;
  const as = e.step.startsWith('doppel') && v.as !== 'doppel' ? `Doppelgänger devenu ${roleName(v.as)}` : roleName(v.as);
  const who = `${name(e.actor)} (${as})`;
  const seen = v.cards.map((c) => `${placeText(c.place, name)} : ${roleName(c.role)}`);
  const auto = e.auto ? ' (au hasard, faute de choix)' : '';
  if (v.mates) {
    if (v.as === 'loup') return v.mates.length ? `${who} se reconnaît avec ${listing(v.mates.map(name))}.` : `${who} se réveille sans autre Loup-Garou.`;
    if (v.as === 'sbire') return v.mates.length ? `${who} voit les Loups-Garous : ${listing(v.mates.map(name))}.` : `${who} ne voit aucun Loup-Garou.`;
    if (v.as === 'macon') return v.mates.length ? `${who} se reconnaît avec ${listing(v.mates.map(name))}.` : `${who} ne voit aucun autre Franc-Maçon.`;
  }
  if (v.as === 'insomniaque') return `${who} regarde sa carte : ${roleName(v.cards[0].role)}.`;
  if (v.swap && v.as === 'voleur') return `${who} échange sa carte avec ${placeText(v.swap[1], name)} et découvre : ${roleName(v.cards[0].role)}${auto}.`;
  if (v.swap && v.as === 'noiseuse') return `${who} échange ${placeText(v.swap[0], name)} et ${placeText(v.swap[1], name)}${auto}.`;
  if (v.swap && v.as === 'soulard') return `${who} échange sa carte avec ${placeText(v.swap[1], name)}, sans la regarder${auto}.`;
  if (e.step === 'doppel' && v.as === 'doppel') return `${who} copie ${seen[0]}${auto}.`;
  return `${who} regarde ${listing(seen)}${auto}.`;
}

/** « Pourquoi ce résultat ? » : quelques phrases, dans l'ordre où tout s'est joué. */
export function outcomeLines(final: FinalView, name: (id: string) => string): string[] {
  const o = final.outcome;
  const role = (id: string) => final.players.find((p) => p.id === id)?.as ?? 'villageois';
  const label = (id: string) => `${name(id)} (${roleName(role(id))})`;
  const lines: string[] = [];
  if (o.noDeath) lines.push('Chacun a reçu exactement une voix : personne ne meurt.');
  else {
    const max = Math.max(...final.players.map((p) => p.votes));
    lines.push(o.killed.length > 1 ? `Égalité à ${max} voix : le vote élimine ${listing(o.killed.map(label))}.` : `Avec ${max} voix, le vote élimine ${label(o.killed[0])}.`);
  }
  for (const s of o.shots) lines.push(`${name(s.by)} était Chasseur : son tir emporte ${label(s.target)}.`);
  const dead = new Set(o.dead);
  const tannerDead = o.dead.some((id) => role(id) === 'tanneur');
  const wolfDead = o.dead.some((id) => role(id) === 'loup');
  const villagerDead = o.dead.some((id) => teamOf(role(id)) === 'village');
  if (o.wolves.length) {
    const wolves = listing(o.wolves.map(name));
    if (wolfDead) lines.push(`Un Loup-Garou est mort : le village gagne.${tannerDead ? ' Le Tanneur, mort lui aussi, gagne avec lui.' : ''}`);
    else if (tannerDead) lines.push(`Aucun Loup-Garou n’est mort (${o.wolves.length > 1 ? 'les Loups-Garous' : 'Loup-Garou'} : ${wolves}), mais le Tanneur a obtenu ce qu’il voulait : il gagne seul.`);
    else lines.push(`Aucun Loup-Garou n’est mort (${o.wolves.length > 1 ? 'les Loups-Garous' : 'Loup-Garou'} : ${wolves}) : la meute gagne.`);
  } else {
    const inCenter = final.centerEnd.filter((id) => final.cards[id].role === 'loup').length;
    lines.push(inCenter > 1 ? 'Aucun Loup-Garou parmi vous : les deux étaient au centre.' : 'Aucun Loup-Garou parmi vous : il était au centre.');
    if (tannerDead) lines.push('Le Tanneur est mort : il gagne seul.');
    else if (!villagerDead) lines.push(o.dead.length ? 'Personne du village n’est mort : le village gagne.' : 'Personne n’est mort : le village gagne.');
    else {
      const sbire = final.players.filter((p) => p.as === 'sbire' && !dead.has(p.id) && p.winner);
      lines.push(`Un joueur du village est mort : le village perd.${sbire.length ? ` ${listing(sbire.map((p) => p.name))}, Sbire en vie, gagne.` : ''}`);
    }
  }
  // Les cartes qui ont changé de main : c'est la carte de la fin qui compte.
  const moved = final.players.filter((p) => p.startCard !== p.endCard && final.cards[p.startCard].role !== final.cards[p.endCard].role).slice(0, 3);
  for (const p of moved) lines.push(`${p.name} avait reçu ${roleName(final.cards[p.startCard].role)}, mais finit ${roleName(p.as)} : c’est la carte de la fin qui compte.`);
  return lines;
}

export const DAY_LABEL: Record<DaySetting, string> = { 180: '3 min', 300: '5 min', 600: '10 min', 0: 'Sans limite' };
export const DAY_SUB: Record<DaySetting, string> = { 180: 'habitués', 300: 'conseillé', 600: '1re partie', 0: 'à l’hôte' };

export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
