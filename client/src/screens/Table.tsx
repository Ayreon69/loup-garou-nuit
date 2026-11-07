// La partie : la carte qu'on découvre en secret, la nuit étape par étape, le débat avec ses annonces, puis le vote.
// La nuit, tout le monde voit le même écran et touche des cartes : de loin, personne ne devine qui agit.
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Check, Eye, Hand, LogOut, Megaphone, Menu, MessageCircle, Moon, Send, Square, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { EMOTES, type Ask, type Claim, type ClaimKind, type GameView, type Place, type PlayerView, type Role, type RoomView, type StepId } from '../../../shared/protocol';
import { ASK_TEXT, DAWN_LINE, DUSK_LINE, NARRATION, ROLE_INFO, STEP_ROLE, TEAM_INFO, claimText, leftOf } from '../../../shared/roles';
import { RoleArt } from '../components/Art';
import { Card } from '../components/Card';
import { HoldCard } from '../components/HoldCard';
import { ClaimBuilder } from '../components/ClaimBuilder';
import { Spread, type Slot, type SwapShow } from '../components/Spread';
import { Avatar, Button, Logo, Modal, Pill, Scene, TimeBar, Toggle, type Mood } from '../components/Ui';
import { sfx } from '../lib/sound';
import { clock, listing, nameOf, realName, visionText } from '../lib/text';
import { cls, noMouseFocus, secondsLeft, useTick, vibrate } from '../lib/util';
import { hush, prefetchVoice, say, voiceSupported } from '../lib/voice';
import { leaveRoom, send, socket } from '../net';
import { useStore } from '../store';

const placeKey = (p: Place) => ('player' in p ? `p:${p.player}` : `c:${p.center}`);

function useVoiceOn(view: RoomView): boolean {
  const pref = useStore((s) => s.prefs.voice);
  return voiceSupported() && (pref ?? view.hostId === view.me);
}

/** Le narrateur : la voix (si elle est allumée sur ce téléphone) et les sons, à chaque changement d'étape. */
function useNarrator(view: RoomView) {
  const g = view.game!;
  const voice = useVoiceOn(view);
  const key = `${g.stage}:${g.step}`;
  const last = useRef<{ stage: string; step: number } | null>(null);
  useEffect(() => {
    const prev = last.current;
    last.current = { stage: g.stage, step: g.step };
    if (!prev) return;
    const lines: string[] = [];
    if (g.stage === 'night') {
      if (prev.stage === 'night' && prev.step >= 0 && prev.step < g.steps.length) lines.push(`${g.steps[prev.step]}-sleep`);
      if (g.step < 0) {
        lines.push('dusk');
        sfx.owl();
      } else if (g.step >= g.steps.length) {
        lines.push('dawn');
        sfx.dawn();
      } else {
        lines.push(`${g.steps[g.step]}-wake`);
        sfx.gong();
      }
    } else if (g.stage === 'vote' && prev.stage === 'day') {
      lines.push('vote');
      sfx.drum(0);
    }
    if (lines.length && voice) say(lines);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => () => hush(), []);
  // Les répliques de cette partie se chargent pendant la distribution.
  const steps = g.steps.join(',');
  useEffect(() => {
    if (voice) prefetchVoice(['dusk', 'dawn', 'vote', ...g.steps.flatMap((s) => [`${s}-wake`, `${s}-sleep`])]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice, steps]);
}

function stageLabel(g: GameView): string {
  if (g.stage === 'deal') return 'Distribution';
  if (g.stage === 'night') {
    if (g.step < 0) return 'La nuit tombe';
    if (g.step >= g.steps.length) return 'L’aube';
    return `Nuit · ${g.step + 1}/${g.steps.length}`;
  }
  if (g.stage === 'day') return 'Le débat';
  return 'Le vote';
}

function moodOf(g: GameView): Mood {
  if (g.stage === 'night') return g.step >= g.steps.length ? 'dawn' : 'deep';
  if (g.stage === 'day') return 'day';
  if (g.stage === 'vote' || g.stage === 'over') return 'vote';
  return 'night';
}

function Countdown({ endsAt, warn = 10 }: { endsAt: number; warn?: number }) {
  const now = useTick(250);
  const s = secondsLeft(endsAt, now);
  const lastTick = useRef(-1);
  useEffect(() => {
    if (s > 0 && s <= 5 && s !== lastTick.current) {
      lastTick.current = s;
      sfx.tick();
    }
  }, [s]);
  if (!endsAt) return null;
  return <span className={cls('countdown', s <= warn && 'is-low')}>{clock(s)}</span>;
}

function TopBar({ view, onMenu }: { view: RoomView; onMenu: () => void }) {
  const g = view.game!;
  const showClock = g.stage === 'day' || g.stage === 'vote';
  return (
    <header className="topbar">
      <Logo size="sm" />
      <span className="stage-chip">
        {g.stage === 'night' ? <Moon size={14} aria-hidden /> : g.stage === 'day' ? <MessageCircle size={14} aria-hidden /> : g.stage === 'deal' ? <Eye size={14} aria-hidden /> : <Hand size={14} aria-hidden />}
        {stageLabel(g)}
      </span>
      {showClock && <Countdown endsAt={g.endsAt} warn={g.stage === 'day' ? 30 : 10} />}
      <button type="button" className="icon-btn menu-btn" aria-label="Menu" onClick={onMenu}>
        <Menu size={20} />
      </button>
    </header>
  );
}

function GameMenu({ view, open, onClose }: { view: RoomView; open: boolean; onClose: () => void }) {
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const setRules = useStore((s) => s.setRulesOpen);
  const voiceOn = useVoiceOn(view);
  const isHost = view.hostId === view.me;
  const g = view.game!;
  return (
    <Modal open={open} onClose={onClose} title="Menu">
      <div className="menu-list">
        <Button icon={<BookOpen size={18} />} onClick={() => (onClose(), setRules(true))}>
          Les règles et les rôles
        </Button>
        {voiceSupported() && <Toggle on={voiceOn} onChange={(voice) => setPrefs({ voice })} label="Voix du narrateur" sub="sur ce téléphone (par défaut, chez l’hôte)" />}
        <Toggle on={prefs.sound} onChange={(sound) => setPrefs({ sound })} label="Sons et vibrations" />
        {isHost && g.stage === 'day' && (
          <Button variant="soft" icon={<Hand size={18} />} onClick={() => (onClose(), void send('game:voteNow'))}>
            Passer au vote maintenant
          </Button>
        )}
        {isHost && (
          <Button variant="danger" icon={<Square size={16} />} onClick={() => (onClose(), void send('game:end'))}>
            Arrêter la partie (retour au salon)
          </Button>
        )}
        <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
          Quitter la table
        </Button>
      </div>
    </Modal>
  );
}

/** Les rôles en jeu, dans l'ordre du réveil : c'est public, comme sur une vraie table. */
function RoleStrip({ roles, title = 'Rôles en jeu' }: { roles: Role[]; title?: string }) {
  const open = useStore((s) => s.setRoleSheet);
  const counts = useMemo(() => {
    const m = new Map<Role, number>();
    for (const r of roles) m.set(r, (m.get(r) ?? 0) + 1);
    return [...m];
  }, [roles]);
  return (
    <section className="role-strip" aria-label={title}>
      <span className="strip-title">
        {title} <span className="muted">· {roles.length} cartes, dont 3 au centre</span>
      </span>
      <div className="strip-cards">
        {counts.map(([r, n]) => (
          <button key={r} type="button" className="strip-card" onClick={() => open(r)} aria-label={`${ROLE_INFO[r].name}${n > 1 ? ` ×${n}` : ''} : la fiche`}>
            <span className="strip-pic">
              <RoleArt role={r} className="strip-art" />
              {ROLE_INFO[r].wake !== null && <i className="strip-wake">{ROLE_INFO[r].wake}</i>}
            </span>
            <span>{ROLE_INFO[r].name}</span>
            {n > 1 && <b className="strip-n">×{n}</b>}
          </button>
        ))}
      </div>
    </section>
  );
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <motion.p className="tip" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <span className="tip-mark" aria-hidden>
        ✦
      </span>
      <span>{children}</span>
    </motion.p>
  );
}

// ───────────────────────────── Distribution ─────────────────────────────

function Deal({ view }: { view: RoomView }) {
  const g = view.game!;
  const me = view.players.find((p) => p.id === view.me);
  const seated = g.order.includes(view.me);
  const [seen, setSeen] = useState(false);
  const [held, setHeld] = useState(false);
  const role = g.myCard;
  const ready = !!me?.ready;
  const readyCount = view.players.filter((p) => g.order.includes(p.id) && p.ready).length;
  return (
    <div className="stage deal">
      {seated && role ? (
        <>
          <h1 className="stage-title">Ta carte</h1>
          <p className="stage-sub">Personne d’autre ne doit voir ton écran.</p>
          <HoldCard
            role={role}
            onSeen={() => {
              setSeen(true);
              setHeld(true);
            }}
          />
          <div className={cls('deal-info', held && 'is-known')}>
            {held ? (
              <>
                <p>
                  <b>{ROLE_INFO[role].name}</b> · {role === 'doppel' ? 'équipe du rôle copié' : `équipe ${TEAM_INFO[ROLE_INFO[role].team].name}`}
                </p>
                <p className="small">{ROLE_INFO[role].night}</p>
                <button type="button" className="link" onClick={() => setHeld(false)}>
                  Masquer ce texte
                </button>
              </>
            ) : (
              <p className="small muted">{seen ? 'Texte masqué.' : 'Retiens bien ton rôle : au matin, on ne regarde plus sa carte (comme dans le vrai jeu).'}</p>
            )}
          </div>
          <Button
            variant="primary"
            className="btn-lg"
            icon={<Check size={20} />}
            disabled={!seen || ready}
            onClick={() => {
              setHeld(false);
              void send('game:seen');
            }}
          >
            {ready ? `Prêt ! On attend les autres (${readyCount}/${g.order.length})` : seen ? 'J’ai vu ma carte' : 'Regarde d’abord ta carte'}
          </Button>
          {view.settings.tips && <Tip>Quand tout le monde a vu sa carte, la nuit tombe. L’appli appellera chaque rôle : tu n’as rien à retenir de l’ordre.</Tip>}
        </>
      ) : (
        <>
          <h1 className="stage-title">La distribution</h1>
          <p className="stage-sub">Tu regardes la partie : chacun découvre sa carte en secret.</p>
        </>
      )}
      <RoleStrip roles={g.roles} />
    </div>
  );
}

// ───────────────────────────── La nuit ─────────────────────────────

/** Ce qu'on peut toucher pour le geste demandé. */
function targetable(ask: Ask | null, slot: string, me: string): boolean {
  if (!ask) return false;
  const isCenter = slot.startsWith('c:');
  if (slot === `p:${me}`) return false;
  if (ask === 'drunk' || ask === 'peek') return isCenter;
  if (ask === 'seer') return true;
  return !isCenter;
}

function Night({ view }: { view: RoomView }) {
  const g = view.game!;
  const me = view.me;
  const n = g.night;
  const step: StepId | null = g.step >= 0 && g.step < g.steps.length ? g.steps[g.step] : null;
  const [picked, setPicked] = useState<string[]>([]);
  const [wiggle, setWiggle] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const ask = n?.ask ?? null;
  const total = g.step >= 0 && g.step < g.steps.length ? (step === 'doppel' ? 26_000 : view.settings.pace === 'normale' ? 12_000 : 18_000) : 5_000;
  useEffect(() => {
    setPicked([]);
    setSent(false);
  }, [g.step, ask]);
  // Mon réveil : un petit signal (son et vibration), seulement chez moi.
  const awake = !!n;
  useEffect(() => {
    if (awake) {
      sfx.mine();
      vibrate([30, 60, 30]);
    }
  }, [awake, g.step]);

  const seen = new Map<string, Role>();
  // Les complices reconnus les yeux ouverts (ou le pouce levé, pour le Sbire) : une étiquette sur leur carte.
  const mates = new Map<string, string>();
  let lastSwap: SwapShow | null = null;
  n?.seen.forEach((v, i) => {
    for (const c of v.cards) seen.set(placeKey(c.place), c.role);
    for (const id of v.mates ?? []) mates.set(`p:${id}`, v.as === 'macon' ? 'Franc-Maçon' : 'Loup-Garou');
    if (v.swap) lastSwap = { id: `${g.step}-${i}`, a: placeKey(v.swap[0]), b: placeKey(v.swap[1]) };
  });
  useEffect(() => {
    if (lastSwap) sfx.swap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(lastSwap as SwapShow | null)?.id]);

  const act = (players: string[], center: number[]) => {
    setSent(true);
    void send('game:act', { step: g.step, players, center }).then((ok) => {
      if (!ok) setSent(false);
      else sfx.flip();
    });
  };

  const tap = (key: string) => {
    sfx.tap();
    if (!ask || sent || !targetable(ask, key, me)) {
      // Un geste pour brouiller les pistes : la carte frémit, rien n'est envoyé.
      setWiggle(key);
      window.setTimeout(() => setWiggle((w) => (w === key ? null : w)), 420);
      return;
    }
    const isCenter = key.startsWith('c:');
    const id = key.slice(2);
    if (ask === 'copy' || ask === 'rob') return act([id], []);
    if (ask === 'drunk' || ask === 'peek') return act([], [Number(id)]);
    if (ask === 'swap') {
      const next = picked.includes(key) ? picked.filter((k) => k !== key) : [...picked, key];
      if (next.length === 2) return act(next.map((k) => k.slice(2)), []);
      return setPicked(next);
    }
    if (ask === 'seer') {
      if (!isCenter) return act([id], []);
      const next = picked.includes(key) ? picked.filter((k) => k !== key) : [...picked.filter((k) => k.startsWith('c:')), key];
      if (next.length === 2) return act([], next.map((k) => Number(k.slice(2))));
      return setPicked(next);
    }
  };

  const seats: Slot[] = g.order.map((id) => {
    const p = view.players.find((x) => x.id === id);
    return { key: `p:${id}`, label: id === me ? 'Toi' : (p?.name ?? '?'), avatar: p?.avatar, me: id === me };
  });
  const center: Slot[] = [0, 1, 2].map((c) => ({ key: `c:${c}`, label: ['Gauche', 'Milieu', 'Droite'][c] }));
  const name = (id: string) => nameOf(view, id);

  const line = g.step < 0 ? DUSK_LINE : !step ? DAWN_LINE : NARRATION[step].wake;
  const label = g.step < 0 ? 'La nuit tombe' : !step ? 'Le jour se lève' : NARRATION[step].label;
  return (
    <div className="stage night">
      <section className="narrator" aria-live="polite">
        <div className="steps-dots" aria-hidden>
          {g.steps.map((s, i) => (
            <span key={s} className={cls('dot', i < g.step && 'is-past', i === g.step && 'is-now')} title={NARRATION[s].label}>
              <RoleArt role={STEP_ROLE[s]} />
            </span>
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={g.step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.35 }}>
            <span className="narrator-label">{label}</span>
            <p className="narrator-line">{line}</p>
          </motion.div>
        </AnimatePresence>
        <TimeBar endsAt={g.endsAt} total={total} />
      </section>

      {step && (
        <section className={cls('night-status', n ? 'is-awake' : 'is-asleep')}>
          {n ? (
            <>
              <span className="awake-card">
                <Card role={n.as} size="xs" />
              </span>
              <div>
                <b className="awake-title">{ask ? ASK_TEXT[ask].title : n.seen.length ? 'Ce que tu vois' : 'Les yeux ouverts'}</b>
                {n.seen.length > 0 && (
                  <motion.div className="vision" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    {n.seen.map((v, i) => (
                      <p key={i}>{visionText(v, name, me)}</p>
                    ))}
                  </motion.div>
                )}
                {ask ? <p className="small">{ASK_TEXT[ask].hint}</p> : n.seen.length > 0 && <p className="tiny muted">Retiens-le bien : au matin, plus rien ne sera affiché.</p>}
                {ask && ['copy', 'rob', 'swap', 'drunk'].includes(ask) && view.settings.tips && <p className="tiny muted">Sans choix à temps, l’appli choisira au hasard pour toi.</p>}
              </div>
            </>
          ) : (
            <>
              <Moon size={22} aria-hidden />
              <div>
                <b className="awake-title">Tu dors…</b>
                <p className="small">Touche des cartes au hasard : de loin, personne ne devine qui agit.</p>
              </div>
            </>
          )}
        </section>
      )}

      <Spread
        className="night-spread"
        seats={seats}
        center={center}
        swap={lastSwap}
        card={(s) => {
          const role = seen.get(s.key);
          const can = targetable(ask, s.key, me) && !sent;
          return (
            <Card
              role={role}
              up={!!role}
              size="sm"
              onClick={() => tap(s.key)}
              glow={can}
              selected={picked.includes(s.key)}
              badge={mates.get(s.key)}
              className={cls(wiggle === s.key && 'is-wiggle')}
              label={role ? `${s.label} : ${ROLE_INFO[role].name}` : `Carte : ${s.label}`}
            />
          );
        }}
      />

    </div>
  );
}

// ───────────────────────────── Le jour ─────────────────────────────

function lastRoleClaim(claims: Claim[], id: string): Claim | undefined {
  for (let i = claims.length - 1; i >= 0; i--) if (claims[i].by === id && claims[i].kind === 'role') return claims[i];
  return undefined;
}

function ClaimChip({ claim }: { claim?: Claim }) {
  if (!claim?.role) return <span className="claim-chip is-none">pas encore d’annonce</span>;
  return (
    <span className="claim-chip">
      <RoleArt role={claim.role} className="claim-chip-art" />
      {ROLE_INFO[claim.role].name}
    </span>
  );
}

function PlayerRow({ view, p }: { view: RoomView; p: PlayerView }) {
  const g = view.game!;
  const claim = lastRoleClaim(g.claims, p.id);
  const suspects = g.claims.filter((c) => c.kind === 'suspect' && c.players?.[0] === p.id);
  const by = [...new Set(suspects.map((c) => c.by))];
  const emotes = useStore((s) => s.emotes.filter((e) => e.playerId === p.id));
  const text = claim ? claimText(claim, realName(view)) : '';
  return (
    <li className={cls('prow', p.id === view.me && 'is-me', p.ready && 'is-ready')}>
      <Avatar avatar={p.avatar} className="prow-avatar" />
      <div className="prow-main">
        <span className="prow-name">
          {p.name}
          {p.id === view.me && <span className="muted"> (toi)</span>}
          {p.isBot && <Pill tone="soft">Bot</Pill>}
          {p.autopilot && <Pill>Absent</Pill>}
        </span>
        <ClaimChip claim={claim} />
        {text && <span className="prow-claim">{text.replace(/^Je suis [^.]+\.\s?/, '') || ''}</span>}
        {by.length > 0 && <span className="prow-suspect">Soupçonné par {listing(by.map((id) => nameOf(view, id)))}</span>}
      </div>
      {p.ready && (
        <span className="prow-ready">
          <Check size={14} aria-hidden /> prêt
        </span>
      )}
      <AnimatePresence>
        {emotes.map((e) => (
          <motion.span key={e.id} className="emote-pop" initial={{ y: 6, opacity: 0, scale: 0.6 }} animate={{ y: -10, opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            {e.emoji}
          </motion.span>
        ))}
      </AnimatePresence>
    </li>
  );
}

function Feed({ view }: { view: RoomView }) {
  const g = view.game!;
  const items = useMemo(() => {
    const list: { key: string; by: string; text: string; kind: ClaimKind | 'chat'; role?: Role }[] = [];
    for (const c of g.claims) list.push({ key: `c${c.n}`, by: c.by, text: claimText(c, realName(view)), kind: c.kind, role: c.role });
    for (const m of g.chat) list.push({ key: `m${m.n}`, by: m.by, text: m.text, kind: 'chat' });
    return list;
  }, [g.claims, g.chat, view]);
  // Les annonces et les messages se mêlent dans l'ordre d'arrivée : on garde l'ordre des numéros respectifs.
  const order = useRef<string[]>([]);
  for (const it of items) if (!order.current.includes(it.key)) order.current.push(it.key);
  const sorted = [...items].sort((a, b) => order.current.indexOf(a.key) - order.current.indexOf(b.key));
  const count = g.claims.length;
  const prev = useRef(count);
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (count > prev.current) sfx.claim();
    prev.current = count;
  }, [count]);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [sorted.length]);
  if (!sorted.length) return <p className="feed-empty">Personne n’a encore rien annoncé. Lance-toi : dis ton rôle (ou un autre…).</p>;
  return (
    <ol ref={list} className="feed">
      <AnimatePresence initial={false}>
        {sorted.map((it) => {
          const p = view.players.find((x) => x.id === it.by);
          return (
            <motion.li key={it.key} className={cls('feed-item', `is-${it.kind}`)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} layout>
              <Avatar avatar={p?.avatar ?? 'lune'} className="feed-avatar" />
              <span className="feed-text">
                <b className="feed-who">{it.by === view.me ? 'Toi' : (p?.name ?? '?')}</b>
                <span>{it.text}</span>
              </span>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}

function ChatBox() {
  const [text, setText] = useState('');
  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    if (await send('game:say', { text: t })) setText('');
  };
  return (
    <form
      className="chatbox"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <input className="input" value={text} maxLength={200} placeholder="Écris à la table…" aria-label="Message à la table" onChange={(e) => setText(e.target.value)} />
      <button type="submit" className="icon-btn send-btn" aria-label="Envoyer" disabled={!text.trim()}>
        <Send size={18} />
      </button>
    </form>
  );
}

function Emotes() {
  const [last, setLast] = useState(0);
  return (
    <div className="emote-bar" role="group" aria-label="Réactions">
      {EMOTES.map((e) => (
        <button
          key={e}
          type="button"
          className="emote-btn"
          {...noMouseFocus}
          onClick={() => {
            if (Date.now() - last < 1000) return;
            setLast(Date.now());
            socket.emit('emote', { emoji: e });
          }}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

const DAY_TIPS = [
  'Commencez par dire chacun votre rôle. Les Loups-Garous, eux, mentent.',
  'Ta carte a peut-être changé cette nuit : écoute le Voleur, la Noiseuse et le Soûlard.',
  'Une carte vue par la Voyante a pu être volée ou échangée ensuite.',
  'Deux joueurs annoncent le même rôle unique ? L’un des deux ment.',
  'Aucun Loup parmi vous ? Votez chacun pour votre voisin : personne ne meurt.',
];

function Day({ view }: { view: RoomView }) {
  const g = view.game!;
  const seated = g.order.includes(view.me);
  const me = view.players.find((p) => p.id === view.me);
  const [builder, setBuilder] = useState<ClaimKind | null>(null);
  const [tip, setTip] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTip((x) => (x + 1) % DAY_TIPS.length), 14_000);
    return () => window.clearInterval(t);
  }, []);
  const players = g.order.map((id) => view.players.find((p) => p.id === id)!).filter(Boolean);
  const ready = players.filter((p) => p.ready).length;
  const written = view.settings.talk === 'ecrit';
  return (
    <div className="stage day">
      <div className="day-head">
        <h1 className="stage-title">Le débat</h1>
        <p className="stage-sub">{written ? 'Écrivez-vous, annoncez, accusez.' : 'Parlez à voix haute ; les annonces s’affichent pour toute la table.'}</p>
      </div>
      {view.settings.tips && (
        <AnimatePresence mode="wait">
          <motion.p key={tip} className="tip" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <span className="tip-mark" aria-hidden>
              ✦
            </span>
            <span>{DAY_TIPS[tip]}</span>
          </motion.p>
        </AnimatePresence>
      )}
      <RoleStrip roles={g.roles} title="Pense-bête" />
      <div className="day-grid">
        <section className="panel">
          <div className="panel-head">
            <h3>
              <Users size={18} aria-hidden /> La table
            </h3>
            <span className="muted small">
              {ready}/{players.length} prêts à voter
            </span>
          </div>
          <ul className="prows">
            {players.map((p) => (
              <PlayerRow key={p.id} view={view} p={p} />
            ))}
          </ul>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h3>
              <Megaphone size={18} aria-hidden /> {written ? 'Le fil' : 'Les annonces'}
            </h3>
          </div>
          <Feed view={view} />
          {written && seated && <ChatBox />}
        </section>
      </div>
      {seated && (
        <div className="actionbar">
          <Emotes />
          <div className="actionbar-main">
            <Button variant="soft" icon={<Megaphone size={18} />} onClick={() => setBuilder('role')}>
              Annoncer
            </Button>
            <Button variant={me?.ready ? 'default' : 'primary'} icon={me?.ready ? <Check size={18} /> : <Hand size={18} />} {...noMouseFocus} onClick={() => void send('game:ready', { ready: !me?.ready })}>
              {me?.ready ? 'Prêt (annuler)' : 'Prêt à voter'}
            </Button>
          </div>
        </div>
      )}
      <ClaimBuilder view={view} open={!!builder} start={builder ?? undefined} onClose={() => setBuilder(null)} />
    </div>
  );
}

// ───────────────────────────── Le vote ─────────────────────────────

function Vote({ view }: { view: RoomView }) {
  const g = view.game!;
  const seated = g.order.includes(view.me);
  const players = g.order.map((id) => view.players.find((p) => p.id === id)!).filter(Boolean);
  const voted = players.filter((p) => p.ready).length;
  const neighbour = seated ? leftOf(g.order, view.me) : null;
  const [pending, setPending] = useState<string | null>(null);
  const mine = pending ?? g.myVote;
  useEffect(() => setPending(null), [g.myVote]);
  const vote = (id: string) => {
    if (g.stage !== 'vote') return;
    setPending(id);
    sfx.tap();
    vibrate(12);
    void send('game:vote', { target: id }).then((ok) => !ok && setPending(null));
  };
  if (g.stage === 'over')
    return (
      <div className="stage vote is-over">
        <motion.div className="drumroll" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <Hand size={42} aria-hidden />
          <h1 className="stage-title">Tout le monde a voté</h1>
          <p className="stage-sub">Le village retient son souffle…</p>
        </motion.div>
      </div>
    );
  return (
    <div className="stage vote">
      <h1 className="stage-title">Qui doit mourir ?</h1>
      <p className="stage-sub">Chacun vote en secret ; tout sera dévoilé d’un coup. Tu peux changer d’avis jusqu’au dernier vote.</p>
      <TimeBar endsAt={g.endsAt} total={60_000} />
      {seated ? (
        <div className="vote-grid">
          {players
            .filter((p) => p.id !== view.me)
            .map((p) => {
              const claim = lastRoleClaim(g.claims, p.id);
              return (
                <button key={p.id} type="button" className={cls('vote-tile', mine === p.id && 'is-on')} aria-pressed={mine === p.id} {...noMouseFocus} onClick={() => vote(p.id)}>
                  <Avatar avatar={p.avatar} className="vote-avatar" />
                  <b>{p.name}</b>
                  <ClaimChip claim={claim} />
                  {p.id === neighbour && <span className="vote-neighbour">ton voisin</span>}
                  {mine === p.id && (
                    <motion.span className="vote-mark" initial={{ scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: -8 }}>
                      Ton vote
                    </motion.span>
                  )}
                </button>
              );
            })}
        </div>
      ) : (
        <p className="stage-sub">Tu regardes la partie : les joueurs votent.</p>
      )}
      {view.settings.tips && seated && neighbour && (
        <Tip>
          Aucun Loup-Garou parmi vous ? Votez chacun pour votre voisin : pour toi, c’est <b>{nameOf(view, neighbour)}</b>. Chacun reçoit une voix, et personne ne meurt.
        </Tip>
      )}
      <div className="voted-row" aria-label={`${voted} sur ${players.length} ont voté`}>
        {players.map((p) => (
          <span key={p.id} className={cls('voted', p.ready && 'is-on')} title={p.name}>
            <Avatar avatar={p.avatar} />
            {p.ready && <Check size={12} className="voted-check" />}
          </span>
        ))}
        <span className="muted small">
          {voted}/{players.length} ont voté
        </span>
      </div>
    </div>
  );
}

// ───────────────────────────── L'écran de partie ─────────────────────────────

export function Table({ view }: { view: RoomView }) {
  const g = view.game!;
  const [menu, setMenu] = useState(false);
  useNarrator(view);
  const sound = useStore((s) => s.prefs.sound);
  useEffect(() => {
    if (!sound) hush();
  }, [sound]);
  return (
    <Scene mood={moodOf(g)} className="table-screen">
      <TopBar view={view} onMenu={() => setMenu(true)} />
      <main className="table-main">
        <AnimatePresence mode="wait">
          <motion.div key={g.stage} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            {g.stage === 'deal' && <Deal view={view} />}
            {g.stage === 'night' && <Night view={view} />}
            {g.stage === 'day' && <Day view={view} />}
            {(g.stage === 'vote' || g.stage === 'over') && <Vote view={view} />}
          </motion.div>
        </AnimatePresence>
      </main>
      <GameMenu view={view} open={menu} onClose={() => setMenu(false)} />
    </Scene>
  );
}

