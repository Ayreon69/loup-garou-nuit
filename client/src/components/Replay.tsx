// La nuit rejouée, réveil par réveil, une fois la partie finie : qui a regardé quoi, et quelles cartes ont changé de place.
// Toutes les cartes sont visibles ; celles que le réveil touche s'éclairent, et les échanges traversent la table.
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FinalView, Place } from '../../../shared/protocol';
import { NARRATION, STEP_ROLE } from '../../../shared/roles';
import { eventText } from '../lib/text';
import { cls, noMouseFocus } from '../lib/util';
import { RoleArt } from './Art';
import { Card } from './Card';
import { Spread, type Slot, type SwapShow } from './Spread';
import { Button } from './Ui';

const keyOf = (p: Place) => ('player' in p ? `p:${p.player}` : `c:${p.center}`);

export function Replay({ final, name, me }: { final: FinalView; name: (id: string) => string; me: string }) {
  const events = final.events;
  const [i, setI] = useState(-1);
  const [auto, setAuto] = useState(false);
  const forward = useRef(true);

  // Où se trouve chaque carte après chaque réveil.
  const layouts = useMemo(() => {
    let cur = new Map<string, number>();
    for (const p of final.players) cur.set(`p:${p.id}`, p.startCard);
    final.centerStart.forEach((c, n) => cur.set(`c:${n}`, c));
    const out = [cur];
    for (const e of events) {
      if (e.vision.swap) {
        cur = new Map(cur);
        const a = keyOf(e.vision.swap[0]);
        const b = keyOf(e.vision.swap[1]);
        const ca = cur.get(a)!;
        cur.set(a, cur.get(b)!);
        cur.set(b, ca);
      }
      out.push(cur);
    }
    return out;
  }, [final, events]);

  useEffect(() => {
    if (!auto) return;
    if (i >= events.length - 1) {
      setAuto(false);
      return;
    }
    const t = window.setTimeout(() => go(i + 1), i < 0 ? 900 : 2800);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, i, events.length]);

  const go = (n: number) => {
    forward.current = n > i;
    setI(Math.max(-1, Math.min(events.length - 1, n)));
  };

  const at = layouts[i + 1];
  const e = i >= 0 ? events[i] : null;
  const touched = new Set<string>();
  if (e) {
    for (const c of e.vision.cards) touched.add(keyOf(c.place));
    for (const p of e.vision.swap ?? []) touched.add(keyOf(p));
    for (const m of e.vision.mates ?? []) touched.add(`p:${m}`);
  }
  const copied = events.findIndex((x) => x.step === 'doppel');
  const swap: SwapShow | null = e?.vision.swap && forward.current ? { id: `r${i}`, a: keyOf(e.vision.swap[0]), b: keyOf(e.vision.swap[1]) } : null;

  const seats: Slot[] = [...final.players]
    .sort((a, b) => a.seat - b.seat)
    .map((p) => ({
      key: `p:${p.id}`,
      label: p.id === me ? 'Toi' : p.name,
      avatar: p.avatar,
      me: p.id === me,
      className: cls(e?.actor === p.id && 'is-actor', touched.has(`p:${p.id}`) && 'is-touched'),
    }));
  const center: Slot[] = [0, 1, 2].map((c) => ({ key: `c:${c}`, label: ['Gauche', 'Milieu', 'Droite'][c], className: cls(touched.has(`c:${c}`) && 'is-touched') }));

  return (
    <div className="replay">
      <div className="replay-dots" role="tablist" aria-label="Les réveils de la nuit">
        <button type="button" role="tab" aria-selected={i === -1} className={cls('replay-dot', i === -1 && 'is-now')} onClick={() => go(-1)} {...noMouseFocus}>
          <span className="replay-start">Début</span>
        </button>
        {events.map((ev, n) => (
          <button key={n} type="button" role="tab" aria-selected={i === n} aria-label={NARRATION[ev.step].label} className={cls('replay-dot', i === n && 'is-now', n < i && 'is-past')} onClick={() => go(n)} {...noMouseFocus}>
            <RoleArt role={STEP_ROLE[ev.step]} />
          </button>
        ))}
      </div>
      <p className="replay-text" aria-live="polite">
        {e ? (
          <>
            <b>{NARRATION[e.step].label}.</b> {eventText(e, name)}
          </>
        ) : (
          'Au début de la nuit : la carte reçue par chacun, et les trois cartes du centre.'
        )}
      </p>
      <Spread
        className="replay-spread"
        seats={seats}
        center={center}
        swap={swap}
        card={(s) => {
          const card = final.cards[at.get(s.key)!];
          return <Card role={card.role} copy={copied >= 0 && i >= copied ? card.copy : null} size="sm" />;
        }}
      />
      <div className="replay-nav">
        <Button variant="ghost" icon={<ChevronLeft size={18} />} disabled={i < 0} onClick={() => go(i - 1)} aria-label="Réveil précédent" />
        <Button
          variant="soft"
          icon={auto ? <Pause size={18} /> : <Play size={18} />}
          disabled={!events.length}
          onClick={() => {
            if (!auto && i >= events.length - 1) go(-1);
            setAuto(!auto);
          }}
        >
          {auto ? 'Pause' : i < 0 ? 'Rejouer la nuit' : 'Lecture'}
        </Button>
        <Button variant="ghost" icon={<ChevronRight size={18} />} disabled={i >= events.length - 1} onClick={() => go(i + 1)} aria-label="Réveil suivant" />
      </div>
      {!events.length && <p className="muted small">Personne ne s’est réveillé cette nuit : tous les rôles actifs étaient au centre.</p>}
    </div>
  );
}
