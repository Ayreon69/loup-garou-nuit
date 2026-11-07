// Briques d'interface communes : boutons, fenêtres, pastilles, sélecteurs, le logo, le décor du théâtre d'ombres,
// les avatars, la fiche d'un rôle et la barre de temps.
import { X } from 'lucide-react';
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ROLE_INFO, TEAM_INFO } from '../../../shared/roles';
import { cls, useTick } from '../lib/util';
import { useStore } from '../store';
import { MoonWolf } from './Art';
import { Card } from './Card';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost' | 'danger' | 'soft';
  icon?: ReactNode;
}

export function Button({ variant = 'default', icon, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={cls('btn', `btn-${variant}`, className)} {...rest}>
      {icon}
      {children && <span className="btn-label">{children}</span>}
    </button>
  );
}

/** Le titre : le loup devant la lune, puis le nom. */
export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className={cls('logo', `logo-${size}`)} role="img" aria-label="Loup-Garou pour une Nuit">
      <MoonWolf className="logo-moon" />
      <span className="logo-text" aria-hidden>
        <b>Loup-Garou</b>
        <i>pour une Nuit</i>
      </span>
    </div>
  );
}

export type Mood = 'night' | 'deep' | 'dawn' | 'day' | 'vote';

/** Une ligne de sapins découpés, toujours la même. */
const FOREST = (() => {
  let d = 'M0 200 L0 132';
  let x = 0;
  let seed = 7;
  const r = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  while (x < 400) {
    const w = 9 + r() * 10;
    const h = 22 + r() * 26;
    d += ` L${(x + w * 0.15).toFixed(1)} ${(132 - h * 0.35).toFixed(1)} L${(x + w * 0.05).toFixed(1)} ${(132 - h * 0.35).toFixed(1)} L${(x + w / 2).toFixed(1)} ${(132 - h).toFixed(1)} L${(x + w * 0.95).toFixed(1)} ${(132 - h * 0.35).toFixed(1)} L${(x + w * 0.85).toFixed(1)} ${(132 - h * 0.35).toFixed(1)} L${(x + w).toFixed(1)} 132`;
    x += w * (0.7 + r() * 0.4);
  }
  return `${d} L400 200 Z`;
})();

/** Le décor du théâtre d'ombres : le ciel, la lune, la forêt et les toits du village, découpés en couches. */
export function Scene({ mood = 'night', children, className }: { mood?: Mood; children: ReactNode; className?: string }) {
  return (
    <div className={cls('scene', `mood-${mood}`, className)}>
      <div className="sky" aria-hidden>
        <div className="stars" />
        <div className="moon" />
        <svg className="land" viewBox="0 0 400 200" preserveAspectRatio="xMidYMax slice">
          <path className="hill-far" d="M0 126 Q50 98 110 116 T230 104 T330 110 T400 100 L400 200 L0 200 Z" />
          <path className="forest" d={FOREST} />
          <g className="village">
            <path d="M228 168 L228 150 L240 138 L252 150 L252 168 Z M258 168 L258 146 L274 131 L290 146 L290 168 Z M296 168 L296 154 L306 144 L316 154 L316 168 Z M280 136 L280 128 L285 128 L285 141 Z" />
            <path className="steeple" d="M318 168 L318 132 L325 118 L332 132 L332 168 Z M324.4 104 H325.6 V118 H324.4 Z M321 108 H329 V109.4 H321 Z" />
          </g>
          <g className="windows">
            <rect x="237" y="153" width="5" height="5" />
            <rect x="270" y="150" width="6" height="6" />
            <rect x="303" y="157" width="4" height="5" />
            <rect x="323" y="140" width="4" height="7" />
          </g>
          <path className="ground" d="M0 172 Q80 160 170 170 T400 166 L400 200 L0 200 Z" />
        </svg>
      </div>
      <div className="scene-body">{children}</div>
    </div>
  );
}

export function Pill({ tone, children, className }: { tone?: 'gold' | 'ink' | 'soft' | 'red' | 'teal'; children: ReactNode; className?: string }) {
  return <span className={cls('pill', tone && `pill-${tone}`, className)}>{children}</span>;
}

interface SegmentedOption<T> {
  value: T;
  label: string;
  sub?: string;
  disabled?: boolean;
}

export function Segmented<T extends string | number | boolean>({ options, value, onChange, disabled, label }: { options: SegmentedOption<T>[]; value: T; onChange: (v: T) => void; disabled?: boolean; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled || o.disabled}
          className={cls('seg', o.value === value && 'is-on')}
          onClick={() => onChange(o.value)}
        >
          <b>{o.label}</b>
          {o.sub && <small>{o.sub}</small>}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label, sub, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; sub?: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={cls('toggle', on && 'is-on')} disabled={disabled} onClick={() => onChange(!on)}>
      <span className="toggle-text">
        <b>{label}</b>
        {sub && <small>{sub}</small>}
      </span>
      <span className="toggle-track" aria-hidden>
        <span className="toggle-knob" />
      </span>
    </button>
  );
}

/**
 * Une fenêtre, rendue à la racine du document pour ne dépendre d'aucun parent.
 * Elle s'ouvre avec un petit mouvement en CSS et se ferme d'un coup.
 */
export function Modal({ open, onClose, title, children, wide, footer, className }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; footer?: ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => box.current?.querySelector<HTMLElement>('[data-autofocus], .modal-head button')?.focus({ preventScroll: true }), 30);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      before?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="modal-back" onClick={onClose}>
      <div ref={box} className={cls('modal', wide && 'is-wide', className)} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Fermer" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export const AVATAR_EMOJI: Record<string, string> = {
  lune: '🌙',
  chouette: '🦉',
  renard: '🦊',
  chat: '🐱',
  cerf: '🦌',
  herisson: '🦔',
  lapin: '🐰',
  sanglier: '🐗',
  ours: '🐻',
  chauvesouris: '🦇',
  grenouille: '🐸',
  champignon: '🍄',
};

export const AVATAR_LABELS: Record<string, string> = {
  lune: 'Lune',
  chouette: 'Chouette',
  renard: 'Renard',
  chat: 'Chat',
  cerf: 'Cerf',
  herisson: 'Hérisson',
  lapin: 'Lapin',
  sanglier: 'Sanglier',
  ours: 'Ours',
  chauvesouris: 'Chauve-souris',
  grenouille: 'Grenouille',
  champignon: 'Champignon',
};

export function Avatar({ avatar, className }: { avatar: string; className?: string }) {
  return (
    <span className={cls('avatar', className)} aria-hidden>
      {AVATAR_EMOJI[avatar] ?? '🌙'}
    </span>
  );
}

/** La fiche d'un rôle : la carte, son équipe, sa nuit, sa victoire et un conseil. Ouverte depuis n'importe où. */
export function RoleSheet() {
  const role = useStore((s) => s.roleSheet);
  const close = useStore((s) => s.setRoleSheet);
  const info = role ? ROLE_INFO[role] : null;
  return (
    <Modal open={!!role} onClose={() => close(null)} title={info?.name ?? ''} className="role-sheet">
      {role && info && (
        <div className="sheet">
          <Card role={role} size="md" />
          <div className="sheet-text">
            <p className="sheet-team">
              <span className={cls('team-dot', `team-${info.team}`)} /> {role === 'doppel' ? 'Équipe du rôle copié' : `Équipe : ${TEAM_INFO[info.team].name}`}
              {info.wake !== null ? ` · se réveille en ${info.wake}${info.wake === 1 ? 'er' : 'e'}` : ' · dort toute la nuit'}
            </p>
            <h4>La nuit</h4>
            <p>{info.night}</p>
            <h4>Pour gagner</h4>
            <p>{info.goal}</p>
            <p className="sheet-tip">
              <b>Conseil :</b> {info.tip}
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Le temps qui reste, en une barre qui se vide (rien si pas de limite). */
export function TimeBar({ endsAt, total, className }: { endsAt: number; total: number; className?: string }) {
  const now = useTick(200);
  if (!endsAt || total <= 0) return null;
  const left = Math.max(0, Math.min(1, (endsAt - now) / total));
  return (
    <div className={cls('timebar', left < 0.2 && 'is-low', className)} aria-hidden>
      <span style={{ transform: `scaleX(${left})` }} />
    </div>
  );
}
