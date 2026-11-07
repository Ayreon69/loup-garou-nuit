// Fin de partie, en quatre temps comme autour d'une vraie table : chacun montre du doigt, les morts tombent, toutes les cartes
// se retournent, puis le verdict. Ensuite : pourquoi ce résultat, les annonces démasquées et la nuit rejouée pas à pas.
import confetti from 'canvas-confetti';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Crown, LogOut, Moon, RotateCcw, Trophy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FinalPlayer, FinalView, RoomView, Team } from '../../../shared/protocol';
import { ROLE_INFO, TEAM_INFO, claimText } from '../../../shared/roles';
import { Card } from '../components/Card';
import { Replay } from '../components/Replay';
import { Avatar, Button, Logo, Pill, Scene } from '../components/Ui';
import { sfx } from '../lib/sound';
import { outcomeLines } from '../lib/text';
import { cls, reducedMotion } from '../lib/util';
import { leaveRoom, send } from '../net';

/** Le verdict, en une ligne. */
export function verdict(final: FinalView): { title: string; team: Team | 'none' } {
  const o = final.outcome;
  const tanner = final.players.some((p) => p.as === 'tanneur' && p.winner);
  if (o.village) return { title: tanner ? 'Le village et le Tanneur gagnent !' : 'Le village gagne !', team: 'village' };
  if (o.meute) return { title: 'La meute gagne !', team: 'meute' };
  if (tanner) return { title: 'Le Tanneur gagne !', team: 'tanneur' };
  return { title: 'Personne ne gagne', team: 'none' };
}

function personal(final: FinalView, me: string): string | null {
  const p = final.players.find((x) => x.id === me);
  if (!p) return null;
  const start = final.cards[p.startCard].role;
  const moved = p.startCard !== p.endCard && start !== final.cards[p.endCard].role;
  const team = p.as === 'tanneur' ? 'seul contre tous' : `avec ${TEAM_INFO[p.team].short}`;
  return `${p.winner ? 'Tu gagnes' : 'Tu perds'} : tu finis ${ROLE_INFO[p.as].name}, ${team}${moved ? `, alors que tu avais reçu ${ROLE_INFO[start].name}` : ''}.`;
}

/** Les quatre temps du dévoilement : 0 votes, 1 morts, 2 cartes, 3 verdict. */
function useStages(): [number, () => void] {
  const [stage, setStage] = useState(() => (reducedMotion() ? 3 : 0));
  useEffect(() => {
    if (stage >= 3) return;
    const t = window.setTimeout(() => setStage((s) => s + 1), [1700, 1500, 1800][stage]);
    return () => window.clearTimeout(t);
  }, [stage]);
  return [stage, () => setStage(3)];
}

function PlayerReveal({ p, final, stage, me, name }: { p: FinalPlayer; final: FinalView; stage: number; me: string; name: (id: string) => string }) {
  const start = final.cards[p.startCard];
  const end = final.cards[p.endCard];
  const moved = p.startCard !== p.endCard;
  const shot = final.outcome.shots.find((s) => s.target === p.id);
  const dead = stage >= 1 && p.dead;
  return (
    <li className={cls('reveal-tile', stage >= 2 && `team-${p.team}`, dead && 'is-dead', stage >= 3 && p.winner && 'is-winner', p.id === me && 'is-me')}>
      <div className="reveal-card">
        <Card role={end.role} copy={end.copy} up={stage >= 2} size="sm" />
        <AnimatePresence>
          {dead && (
            <motion.span className="stamp" initial={{ scale: 2.2, opacity: 0, rotate: -24 }} animate={{ scale: 1, opacity: 1, rotate: -12 }} transition={{ type: 'spring', stiffness: 380, damping: 18 }}>
              {shot ? 'Abattu' : 'Éliminé'}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <span className="reveal-name">
        <Avatar avatar={p.avatar} className="reveal-avatar" />
        <b>{p.id === me ? 'Toi' : p.name}</b>
        {stage >= 3 && p.winner && <Crown size={15} className="reveal-crown" aria-label="gagnant" />}
      </span>
      <span className={cls('reveal-votes', p.votes > 1 && 'is-many')}>{p.votes ? `${p.votes} voix` : 'aucune voix'}</span>
      <span className="reveal-vote">
        <ArrowRight size={13} aria-hidden /> {p.vote ? (p.vote === me ? 'toi' : name(p.vote)) : 'personne'}
        {p.autoVote && <i> (au hasard)</i>}
      </span>
      {stage >= 2 && moved && start.role !== end.role && <span className="reveal-was">reçu : {ROLE_INFO[start.role].name}</span>}
      {shot && stage >= 1 && <span className="reveal-was">tir du Chasseur</span>}
    </li>
  );
}

/** Le dévoilement complet, réutilisé par le tutoriel. */
export function RevealBody({ final, me, name, onDone }: { final: FinalView; me: string; name: (id: string) => string; onDone?: () => void }) {
  const [stage, skip] = useStages();
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (stage >= 3) done.current?.();
  }, [stage]);
  const [night, setNight] = useState(false);
  const mine = final.players.find((p) => p.id === me);
  const good = !!mine?.winner;
  const v = verdict(final);
  const played = useRef(-1);
  useEffect(() => {
    if (played.current === stage) return;
    played.current = stage;
    if (stage === 0) sfx.drum(0);
    if (stage === 1 && final.outcome.dead.length) sfx.thud();
    if (stage === 2) {
      sfx.flip();
      if (final.outcome.wolves.length) window.setTimeout(() => sfx.howl(), 250);
    }
    if (stage === 3) {
      sfx.fanfare(good || (!mine && v.team !== 'none'));
      if (good && !reducedMotion()) void confetti({ particleCount: 150, spread: 95, origin: { y: 0.25 }, colors: ['#f2c27a', '#ffe6b0', '#5fa89a', '#cf4a43', '#f7f1e3'], disableForReducedMotion: true });
    }
  }, [stage, final, good, mine, v.team]);

  const players = [...final.players].sort((a, b) => a.seat - b.seat);
  const roleClaims = final.claims.filter((c) => c.kind === 'role' && c.role);
  const realName = name;
  return (
    <div className="reveal">
      <AnimatePresence mode="wait">
        {stage < 3 ? (
          <motion.div key="wait" className="reveal-wait" exit={{ opacity: 0 }}>
            <span className="reveal-step">{['Chacun montre du doigt…', 'Les voix sont comptées…', 'Toutes les cartes se retournent…'][stage]}</span>
            <button type="button" className="link" onClick={skip}>
              Tout voir
            </button>
          </motion.div>
        ) : (
          <motion.header key="verdict" className={cls('verdict', `team-${v.team}`)} initial={{ scale: 0.7, opacity: 0, rotate: -3 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }}>
            <h1>{v.title}</h1>
            {personal(final, me) && <p>{personal(final, me)}</p>}
          </motion.header>
        )}
      </AnimatePresence>

      <section className="reveal-section">
        <h3>Le vote</h3>
        <ul className="reveal-grid">
          {players.map((p) => (
            <PlayerReveal key={p.id} p={p} final={final} stage={stage} me={me} name={realName} />
          ))}
        </ul>
        {stage >= 1 && final.outcome.noDeath && <p className="reveal-note">Chacun a reçu une seule voix : personne ne meurt.</p>}
      </section>

      <section className="reveal-section">
        <h3>Le centre</h3>
        <div className="reveal-center">
          {final.centerEnd.map((id, n) => {
            const before = final.cards[final.centerStart[n]];
            const card = final.cards[id];
            return (
              <div key={n} className="reveal-center-card">
                <Card role={card.role} copy={card.copy} up={stage >= 2} size="xs" />
                <span className="small muted">{['Gauche', 'Milieu', 'Droite'][n]}</span>
                {stage >= 2 && before.role !== card.role && <span className="reveal-was">avant : {ROLE_INFO[before.role].name}</span>}
              </div>
            );
          })}
        </div>
      </section>

      {stage >= 3 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <section className="reveal-section why">
            <h3>Pourquoi ce résultat ?</h3>
            <ul className="why-lines">
              {outcomeLines(final, realName).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </section>

          {roleClaims.length > 0 && (
            <section className="reveal-section">
              <h3>Les annonces, démasquées</h3>
              <ul className="unmask">
                {roleClaims.map((c) => {
                  const p = final.players.find((x) => x.id === c.by);
                  if (!p) return null;
                  const dealt = final.cards[p.startCard].role;
                  const honest = dealt === c.role;
                  return (
                    <li key={c.n}>
                      <Avatar avatar={p.avatar} className="unmask-avatar" />
                      <span className="unmask-text">
                        <b>{p.id === me ? 'Toi' : p.name}</b> « {claimText(c, realName)} »
                      </span>
                      <Pill tone={honest ? 'teal' : 'red'} className="unmask-pill">
                        {honest ? 'vrai rôle' : `avait reçu ${ROLE_INFO[dealt].name}`}
                      </Pill>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="reveal-section">
            <button type="button" className={cls('night-toggle', night && 'is-open')} aria-expanded={night} onClick={() => setNight(!night)}>
              <Moon size={18} aria-hidden /> {night ? 'Masquer la nuit' : 'Revoir la nuit, réveil par réveil'}
            </button>
            {night && <Replay final={final} name={realName} me={me} />}
          </section>
        </motion.div>
      )}
    </div>
  );
}

export function Final({ view }: { view: RoomView }) {
  const final = view.final!;
  const isHost = view.hostId === view.me;
  const host = view.players.find((p) => p.id === view.hostId);
  const v = verdict(final);
  const ranking = [...view.players].filter((p) => p.status !== 'spectator').sort((a, b) => b.wins - a.wins);
  return (
    <Scene mood={v.team === 'meute' ? 'deep' : 'dawn'} className="final-screen">
      <header className="topbar">
        <Logo size="sm" />
        <span className="stage-chip">Fin de la partie</span>
        <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
          Quitter
        </Button>
      </header>
      <main className="final-main">
        <RevealBody final={final} me={view.me} name={(id) => view.players.find((p) => p.id === id)?.name ?? '?'} />
        {ranking.some((p) => p.wins > 0) && (
          <section className="reveal-section">
            <h3>Victoires de la soirée</h3>
            <ol className="wins-list">
              {ranking.map((p) => (
                <li key={p.id} className={cls(p.id === view.me && 'is-me')}>
                  <Avatar avatar={p.avatar} />
                  <span className="wins-name">{p.id === view.me ? 'Toi' : p.name}</span>
                  <b>
                    <Trophy size={14} aria-hidden /> {p.wins}
                  </b>
                </li>
              ))}
            </ol>
          </section>
        )}
      </main>
      <div className="actionbar final-actions">
        {isHost ? (
          <Button variant="primary" className="btn-lg" icon={<RotateCcw size={20} />} onClick={() => void send('game:restart')}>
            Revanche
          </Button>
        ) : (
          <p className="waiting" role="status">
            <span className="spinner" /> {host?.name ?? 'L’hôte'} peut relancer une partie.
          </p>
        )}
      </div>
    </Scene>
  );
}
