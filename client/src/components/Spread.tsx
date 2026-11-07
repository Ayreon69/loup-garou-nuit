// La table vue d'en haut : la carte de chaque joueur, puis les trois cartes du centre.
// Quand deux cartes s'échangent, deux dos de carte traversent la table d'une place à l'autre.
import { AnimatePresence, motion } from 'framer-motion';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cls, reducedMotion } from '../lib/util';
import { CardBackArt } from './Art';
import { Avatar } from './Ui';

export interface Slot {
  /** « p:id » ou « c:0 ». */
  key: string;
  label: string;
  avatar?: string;
  me?: boolean;
  /** Une marque sous le nom (soupçonné, éliminé…). */
  note?: ReactNode;
  className?: string;
}

/** Un échange à montrer : chaque nouvel id relance l'animation. */
export interface SwapShow {
  id: string;
  a: string;
  b: string;
}

interface Flight {
  id: string;
  from: { x: number; y: number; w: number; h: number };
  to: { x: number; y: number; w: number; h: number };
}

export function Spread({ seats, center, card, swap, className, centerLabel = 'Centre' }: { seats: Slot[]; center: Slot[]; card: (slot: Slot) => ReactNode; swap?: SwapShow | null; className?: string; centerLabel?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const done = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!swap || done.current === swap.id || !box.current) return;
    done.current = swap.id;
    if (reducedMotion()) return;
    const root = box.current.getBoundingClientRect();
    const rect = (key: string) => {
      const el = box.current!.querySelector<HTMLElement>(`[data-slot="${key}"] .card`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left - root.left, y: r.top - root.top, w: r.width, h: r.height };
    };
    const ra = rect(swap.a);
    const rb = rect(swap.b);
    if (!ra || !rb) return;
    setFlights([
      { id: `${swap.id}-a`, from: ra, to: rb },
      { id: `${swap.id}-b`, from: rb, to: ra },
    ]);
    setHidden([swap.a, swap.b]);
    const t = window.setTimeout(() => {
      setFlights([]);
      setHidden([]);
    }, 900);
    return () => window.clearTimeout(t);
  }, [swap]);

  const cols = seats.length <= 4 ? seats.length : seats.length <= 6 ? 3 : seats.length <= 8 ? 4 : 5;
  const slot = (s: Slot) => (
    <div key={s.key} data-slot={s.key} className={cls('slot', s.me && 'is-me', hidden.includes(s.key) && 'is-flying', s.className)}>
      {card(s)}
      <span className="slot-label">
        {s.avatar && <Avatar avatar={s.avatar} className="slot-avatar" />}
        <span className="slot-name">{s.label}</span>
      </span>
      {s.note}
    </div>
  );

  return (
    <div ref={box} className={cls('spread', className)} style={{ ['--cols' as string]: cols }}>
      <div className="spread-seats">{seats.map(slot)}</div>
      <div className="spread-center">
        <span className="center-label">{centerLabel}</span>
        <div className="center-cards">{center.map(slot)}</div>
      </div>
      <AnimatePresence>
        {flights.map((f) => (
          <motion.span
            key={f.id}
            className="flight card is-down"
            initial={{ x: f.from.x, y: f.from.y, width: f.from.w, height: f.from.h, rotate: 0 }}
            animate={{ x: f.to.x, y: f.to.y, width: f.to.w, height: f.to.h, rotate: [0, 8, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.75, ease: [0.45, 0, 0.25, 1] }}
          >
            <span className="card-inner">
              <span className="card-face card-back">
                <CardBackArt />
              </span>
            </span>
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}
