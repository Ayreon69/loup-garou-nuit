// Une carte de rôle : le recto (figurine, nom, numéro de réveil, équipe) et le verso (la lune sur la forêt).
// Elle se retourne en 3D ; le reste du temps, elle reste à plat.
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import type { Role } from '../../../shared/protocol';
import { ROLE_INFO, TEAM_INFO } from '../../../shared/roles';
import { cls } from '../lib/util';
import { CardBackArt, RoleArt } from './Art';

export type CardSize = 'xs' | 'sm' | 'md' | 'lg';

interface CardProps {
  role?: Role | null;
  /** Le rôle copié, pour la carte Doppelgänger. */
  copy?: Role | null;
  /** Face visible ; sinon, le dos. */
  up?: boolean;
  size?: CardSize;
  className?: string;
  style?: CSSProperties;
  /** Une marque dans le coin (« Toi », « Centre »…). */
  badge?: ReactNode;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  /** Choix possible : la carte s'éclaire. */
  glow?: boolean;
  selected?: boolean;
  label?: string;
}

export function RoleFace({ role, copy, size }: { role: Role; copy?: Role | null; size: CardSize }) {
  const info = ROLE_INFO[role];
  const team = copy ? ROLE_INFO[copy].team : info.team;
  return (
    <>
      {info.wake !== null && size !== 'xs' && <span className="card-wake">{info.wake}</span>}
      <span className="card-screen">
        <RoleArt role={role} className="card-art" />
      </span>
      <b className="card-name">{info.name}</b>
      {copy && size !== 'xs' && <span className="card-copy">copie : {ROLE_INFO[copy].name}</span>}
      {size !== 'xs' && <span className={cls('card-team', `team-${team}`)}>{TEAM_INFO[team].name}</span>}
    </>
  );
}

export function Card({ role, copy, up = true, size = 'sm', className, style, badge, onClick, disabled, glow, selected, label }: CardProps) {
  const team = role ? (copy ? ROLE_INFO[copy].team : ROLE_INFO[role].team) : null;
  const body = (
    <span className="card-inner">
      <span className="card-face card-front">{role && <RoleFace role={role} copy={copy} size={size} />}</span>
      <span className="card-face card-back">
        <CardBackArt />
      </span>
    </span>
  );
  const classes = cls('card', `size-${size}`, up && role ? 'is-up' : 'is-down', team && `team-${team}`, glow && 'is-glow', selected && 'is-selected', className);
  const aria = label ?? (up && role ? ROLE_INFO[role].name : 'Carte face cachée');
  return onClick ? (
    <button type="button" className={classes} style={style} onClick={onClick} disabled={disabled} aria-label={aria} aria-pressed={selected}>
      {body}
      {badge && <span className="card-badge">{badge}</span>}
    </button>
  ) : (
    <span className={classes} style={style} role="img" aria-label={aria}>
      {body}
      {badge && <span className="card-badge">{badge}</span>}
    </span>
  );
}
