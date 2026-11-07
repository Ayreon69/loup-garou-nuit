// La carte qu'on tient appuyée pour la voir, comme on soulève un coin de sa carte à table : elle se recache dès qu'on lâche.
import type { Role } from '../../../shared/protocol';
import { useState } from 'react';
import { sfx } from '../lib/sound';
import { cls, vibrate } from '../lib/util';
import { Card } from './Card';

export function HoldCard({ role, onSeen, size = 'lg' }: { role: Role; onSeen: () => void; size?: 'md' | 'lg' }) {
  const [up, setUp] = useState(false);
  const show = () => {
    setUp(true);
    sfx.flip();
    vibrate(15);
    onSeen();
  };
  return (
    <button
      type="button"
      className={cls('hold', up && 'is-holding')}
      aria-label="Garde appuyé pour regarder ta carte"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        show();
      }}
      onPointerUp={() => setUp(false)}
      onPointerCancel={() => setUp(false)}
      onLostPointerCapture={() => setUp(false)}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault();
          show();
        }
      }}
      onKeyUp={() => setUp(false)}
      onBlur={() => setUp(false)}
    >
      <Card role={role} up={up} size={size} />
      <span className="hold-hint">{up ? 'Relâche pour la cacher' : 'Garde le doigt appuyé pour la regarder'}</span>
    </button>
  );
}
