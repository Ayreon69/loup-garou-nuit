// « Apprendre en 2 minutes » : une vraie petite partie, guidée pas à pas, avec trois personnages scénarisés.
// Toi (Voleur), Léo (Loup-Garou), Mila (Voyante) et Sam (Villageois) ; au centre, un Loup-Garou, la Noiseuse et un Villageois.
// Cette nuit, tu voles la carte de Léo : tu deviens Loup-Garou sans que personne ne le sache. Au matin, à toi de jouer.
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, ChevronRight, GraduationCap, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Claim, FinalView, NightEvent, Role, StepId } from '../../../shared/protocol';
import { DAWN_LINE, DUSK_LINE, NARRATION, ROLE_INFO, STEP_ROLE, claimText, resolveVote, sortRoles, teamOf } from '../../../shared/roles';
import { sfx } from '../lib/sound';
import { visionText } from '../lib/text';
import { cls, savedBots, vibrate } from '../lib/util';
import { hush, prefetchVoice, say, unlockVoice, voiceSupported } from '../lib/voice';
import { createRoom } from '../net';
import { RevealBody } from '../screens/Final';
import { useStore } from '../store';
import { RoleArt } from './Art';
import { Card } from './Card';
import { HoldCard } from './HoldCard';
import { Spread, type Slot } from './Spread';
import { Avatar, Button, Scene, type Mood } from './Ui';

type Step = 'intro' | 'card' | 'roles' | 'night' | 'voleur' | 'noiseuse' | 'day' | 'claim' | 'vote' | 'reveal' | 'lessons';
const STEPS: Step[] = ['intro', 'card', 'roles', 'night', 'voleur', 'noiseuse', 'day', 'claim', 'vote', 'reveal', 'lessons'];
type Choice = 'honest' | 'villageois' | 'sam';

const ORDER = ['moi', 'leo', 'mila', 'sam'];
const NPC: Record<string, { name: string; avatar: string }> = {
  leo: { name: 'Léo', avatar: 'renard' },
  mila: { name: 'Mila', avatar: 'chouette' },
  sam: { name: 'Sam', avatar: 'herisson' },
};
const IN_PLAY: Role[] = sortRoles(['loup', 'loup', 'voyante', 'voleur', 'noiseuse', 'villageois', 'villageois']);
const NIGHT: StepId[] = ['loups', 'voyante', 'voleur', 'noiseuse'];

const CLAIMS: Claim[] = [
  { n: 1, by: 'mila', kind: 'role', role: 'voyante', players: ['leo'], saw: ['loup'] },
  { n: 2, by: 'leo', kind: 'role', role: 'noiseuse', players: ['mila', 'sam'] },
  { n: 3, by: 'sam', kind: 'role', role: 'villageois' },
];
const MY_CLAIM: Record<Choice, Claim> = {
  honest: { n: 4, by: 'moi', kind: 'role', role: 'voleur', players: ['leo'], saw: ['loup'] },
  villageois: { n: 4, by: 'moi', kind: 'role', role: 'villageois' },
  sam: { n: 4, by: 'moi', kind: 'role', role: 'voleur', players: ['sam'], saw: ['villageois'] },
};
const CHOICE_NOTE: Record<Choice, string> = { honest: 'La vérité', villageois: 'Un mensonge tout simple', sam: 'Un mensonge plus détaillé' };
const REACTIONS: Record<Choice, [string, string][]> = {
  honest: [
    ['mila', 'Merci ! Donc le Loup-Garou, maintenant, c’est toi.'],
    ['sam', 'Logique. Je vote pour toi.'],
    ['leo', 'Je n’y comprends rien… Moi, je vote Mila.'],
  ],
  villageois: [
    ['mila', 'J’ai vu un Loup-Garou chez Léo. Votons Léo !'],
    ['sam', 'Léo se dit Noiseuse, mais rien ne le prouve. Je vote Léo.'],
    ['leo', 'Mila ment ! Je vote pour elle.'],
  ],
  sam: [
    ['sam', 'Tu as pris ma carte ? Alors je suis Voleur… Peu importe : je vote Léo.'],
    ['mila', 'Je maintiens : Léo est Loup-Garou.'],
    ['leo', 'Mila ment ! Je vote pour elle.'],
  ],
};
const VOTES: Record<Choice, Record<string, string>> = {
  honest: { mila: 'moi', sam: 'moi', leo: 'mila' },
  villageois: { mila: 'leo', sam: 'leo', leo: 'mila' },
  sam: { mila: 'leo', sam: 'leo', leo: 'mila' },
};
const FINAL_ROLE: Record<string, Role> = { moi: 'loup', leo: 'voleur', mila: 'voyante', sam: 'villageois' };

const EVENTS: NightEvent[] = [
  { step: 'loups', actor: 'leo', vision: { as: 'loup', cards: [], mates: [] }, auto: false },
  { step: 'loups', actor: 'leo', vision: { as: 'loup', cards: [{ place: { center: 1 }, role: 'noiseuse' }] }, auto: false },
  { step: 'voyante', actor: 'mila', vision: { as: 'voyante', cards: [{ place: { player: 'leo' }, role: 'loup' }] }, auto: false },
  {
    step: 'voleur',
    actor: 'moi',
    vision: { as: 'voleur', cards: [{ place: { player: 'moi' }, role: 'loup' }], swap: [{ player: 'moi' }, { player: 'leo' }] },
    auto: false,
  },
];

function buildFinal(choice: Choice, myVote: string, me: { name: string; avatar: string }): FinalView {
  const votes: Record<string, string> = { ...VOTES[choice], moi: myVote };
  const outcome = resolveVote(ORDER, votes, FINAL_ROLE);
  const info: Record<string, { name: string; avatar: string }> = { ...NPC, moi: me };
  const deck: Role[] = ['voleur', 'loup', 'voyante', 'villageois', 'loup', 'noiseuse', 'villageois'];
  const start: Record<string, number> = { moi: 0, leo: 1, mila: 2, sam: 3 };
  const end: Record<string, number> = { moi: 1, leo: 0, mila: 2, sam: 3 };
  return {
    cards: deck.map((role, id) => ({ id, role, copy: null })),
    centerStart: [4, 5, 6],
    centerEnd: [4, 5, 6],
    players: ORDER.map((id, i) => ({
      id,
      name: info[id].name,
      avatar: info[id].avatar,
      seat: i + 1,
      startCard: start[id],
      endCard: end[id],
      as: FINAL_ROLE[id],
      team: teamOf(FINAL_ROLE[id]),
      vote: votes[id],
      autoVote: false,
      votes: ORDER.filter((x) => x !== id && votes[x] === id).length,
      dead: outcome.dead.includes(id),
      winner: outcome.winners.includes(id),
      wins: 0,
    })),
    roles: IN_PLAY,
    steps: NIGHT,
    events: EVENTS,
    claims: [...CLAIMS, MY_CLAIM[choice]],
    outcome,
  };
}

const MOOD: Record<Step, Mood> = {
  intro: 'night',
  card: 'night',
  roles: 'night',
  night: 'deep',
  voleur: 'deep',
  noiseuse: 'deep',
  day: 'day',
  claim: 'day',
  vote: 'vote',
  reveal: 'dawn',
  lessons: 'dawn',
};

export function Tutorial() {
  const open = useStore((s) => s.tutorialOpen);
  if (!open) return null;
  return createPortal(<TutorialRun />, document.body);
}

function FeedLine({ by, children, me }: { by: string; children: ReactNode; me: { name: string; avatar: string } }) {
  const who = by === 'moi' ? { name: 'Toi', avatar: me.avatar } : NPC[by];
  return (
    <motion.li className="feed-item" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} layout>
      <Avatar avatar={who.avatar} className="feed-avatar" />
      <span className="feed-text">
        <b className="feed-who">{who.name}</b>
        <span>{children}</span>
      </span>
    </motion.li>
  );
}

function TutorialRun() {
  const setOpen = useStore((s) => s.setTutorialOpen);
  const setRoleSheet = useStore((s) => s.setRoleSheet);
  const profile = useStore((s) => s.profile);
  const inRoom = useStore((s) => !!s.view);
  const voicePref = useStore((s) => s.prefs.voice);
  const voice = voiceSupported() && voicePref !== false;
  const [step, setStep] = useState<Step>('intro');
  const [seen, setSeen] = useState(false);
  const [phase, setPhase] = useState(0);
  const [stolen, setStolen] = useState(false);
  const [stolenUp, setStolenUp] = useState(false);
  const [wiggle, setWiggle] = useState<string | null>(null);
  const [shown, setShown] = useState(0);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [reacted, setReacted] = useState(0);
  const [vote, setVote] = useState<string | null>(null);
  const [verdict, setVerdict] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const feedList = useRef<HTMLOListElement>(null);
  const idx = STEPS.indexOf(step);
  const me = { name: profile.name.trim() || 'Toi', avatar: profile.avatar };
  const name = (id: string) => (id === 'moi' ? me.name : NPC[id].name);
  const close = () => {
    hush();
    setOpen(false);
  };
  const next = () => setStep(STEPS[Math.min(STEPS.length - 1, idx + 1)]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !useStore.getState().roleSheet) close();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      hush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [step]);

  // Le narrateur de la nuit, avec sa voix si elle est allumée.
  const nightIndex = step === 'night' ? phase - 1 : step === 'voleur' ? 2 : step === 'noiseuse' ? 3 : -1;
  const line = step === 'night' && phase === 0 ? DUSK_LINE : nightIndex >= 0 ? NARRATION[NIGHT[nightIndex]].wake : step === 'day' ? DAWN_LINE : null;
  useEffect(() => {
    if (!line) return;
    if (step === 'night' && phase === 0) sfx.owl();
    else if (step === 'day') sfx.dawn();
    else sfx.gong();
    if (step === 'voleur') {
      window.setTimeout(() => sfx.mine(), 500);
      vibrate([30, 60, 30]);
    }
    if (voice) say([step === 'night' && phase === 0 ? 'dusk' : nightIndex >= 0 ? `${NIGHT[nightIndex]}-wake` : 'dawn']);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line]);
  useEffect(() => {
    if (step !== 'night' || phase >= 2) return;
    const t = window.setTimeout(() => setPhase((p) => p + 1), phase === 0 ? 3200 : 3800);
    return () => window.clearTimeout(t);
  }, [step, phase]);
  useEffect(() => {
    if (step !== 'day' || shown >= CLAIMS.length) return;
    const t = window.setTimeout(
      () => {
        setShown((s) => s + 1);
        sfx.claim();
      },
      shown === 0 ? 1500 : 1700,
    );
    return () => window.clearTimeout(t);
  }, [step, shown]);
  useEffect(() => {
    if (!choice || reacted >= REACTIONS[choice].length) return;
    const t = window.setTimeout(() => {
      setReacted((r) => r + 1);
      sfx.claim();
    }, 1200);
    return () => window.clearTimeout(t);
  }, [choice, reacted]);
  useEffect(() => {
    feedList.current?.scrollTo({ top: feedList.current.scrollHeight, behavior: 'smooth' });
  }, [shown, choice, reacted]);

  const final = useMemo(() => (choice && vote ? buildFinal(choice, vote, me) : null), [choice, vote, me.name, me.avatar]); // eslint-disable-line react-hooks/exhaustive-deps
  const iWon = !!final?.outcome.winners.includes('moi');

  const tapNight = (key: string) => {
    sfx.tap();
    if (step === 'voleur' && !stolen && key === 'p:leo') {
      setStolen(true);
      sfx.swap();
      vibrate(20);
      window.setTimeout(() => {
        setStolenUp(true);
        sfx.flip();
      }, 950);
      return;
    }
    setWiggle(key);
    window.setTimeout(() => setWiggle((w) => (w === key ? null : w)), 420);
  };

  const play = async (bots: boolean) => {
    const st = useStore.getState();
    close();
    if (!st.profile.name.trim()) {
      st.showToast('Choisis d’abord un pseudo, puis lance la partie.', 'info');
      window.setTimeout(() => document.getElementById('pseudo')?.focus(), 80);
      return;
    }
    await createRoom(bots ? { bots: savedBots(), autostart: true } : {});
  };

  const seats: Slot[] = ORDER.map((id) => ({ key: `p:${id}`, label: id === 'moi' ? 'Toi' : NPC[id].name, avatar: id === 'moi' ? me.avatar : NPC[id].avatar, me: id === 'moi' }));
  const center: Slot[] = [0, 1, 2].map((c) => ({ key: `c:${c}`, label: ['Gauche', 'Milieu', 'Droite'][c] }));
  const nightSpread = (
    <Spread
      className="night-spread"
      seats={seats}
      center={center}
      swap={step === 'voleur' && stolen ? { id: 'steal', a: 'p:moi', b: 'p:leo' } : null}
      card={(s) => {
        const up = step === 'voleur' && stolenUp && s.key === 'p:moi';
        const target = step === 'voleur' && !stolen && s.key === 'p:leo';
        return (
          <Card
            role={up ? 'loup' : undefined}
            up={up}
            size="sm"
            glow={target}
            className={cls(wiggle === s.key && 'is-wiggle')}
            onClick={() => tapNight(s.key)}
            label={up ? 'Ta nouvelle carte : Loup-Garou' : `Carte : ${s.label}`}
          />
        );
      }}
    />
  );
  const narrator = line && (
    <section className="narrator" aria-live="polite">
      <div className="steps-dots" aria-hidden>
        {NIGHT.map((s, i) => (
          <span key={s} className={cls('dot', i < nightIndex && 'is-past', i === nightIndex && 'is-now')}>
            <RoleArt role={STEP_ROLE[s]} />
          </span>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={line} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
          <span className="narrator-label">{step === 'day' ? 'Le jour se lève' : nightIndex >= 0 ? NARRATION[NIGHT[nightIndex]].label : 'La nuit tombe'}</span>
          <p className="narrator-line">{line}</p>
        </motion.div>
      </AnimatePresence>
    </section>
  );
  const allClaims = [...CLAIMS.slice(0, step === 'day' ? shown : CLAIMS.length)];
  const feed = (
    <ol ref={feedList} className="feed tuto-feed">
      <AnimatePresence initial={false}>
        {allClaims.map((c) => (
          <FeedLine key={c.n} by={c.by} me={me}>
            {claimText(c, name)}
          </FeedLine>
        ))}
        {choice && (
          <FeedLine key="mine" by="moi" me={me}>
            {claimText(MY_CLAIM[choice], name)}
          </FeedLine>
        )}
        {choice &&
          REACTIONS[choice].slice(0, reacted).map(([by, text], i) => (
            <FeedLine key={`r${i}`} by={by} me={me}>
              <span className="feed-say">{text}</span>
            </FeedLine>
          ))}
      </AnimatePresence>
    </ol>
  );

  let content: ReactNode = null;
  let coach: ReactNode = null;
  let action: { label: string; disabled?: boolean; onClick?: () => void } | null = { label: 'Suite' };

  switch (step) {
    case 'intro':
      content = (
        <div className="tuto-intro">
          <div className="tuto-fan" aria-hidden>
            <Card role="voyante" size="md" />
            <Card role="loup" size="md" />
            <Card role="voleur" size="md" />
          </div>
          <h1 className="tuto-title">Bienvenue au village</h1>
          <ul className="tuto-points">
            <li>Une partie dure une nuit et un jour : une dizaine de minutes.</li>
            <li>Chacun reçoit un rôle secret. Des Loups-Garous se cachent parmi vous.</li>
            <li>
              Au matin, on débat puis on vote. <b>Si un Loup-Garou meurt, le village gagne</b> ; sinon, la meute gagne.
            </li>
            <li>
              Le piège : la nuit, des cartes changent de main… <b>et ton rôle avec</b>.
            </li>
          </ul>
          <p className="muted small">Une petite partie guidée à 4 joueurs. Tu joues, l’appli t’explique.</p>
        </div>
      );
      action = {
        label: 'C’est parti',
        onClick: () => {
          unlockVoice();
          if (voice) prefetchVoice(['dusk', 'dawn', ...NIGHT.map((s) => `${s}-wake`)]);
          next();
        },
      };
      break;
    case 'card':
      content = (
        <div className="tuto-center">
          <h2 className="stage-title">Ta carte</h2>
          <HoldCard role="voleur" onSeen={() => setSeen(true)} />
        </div>
      );
      coach = seen ? (
        <>
          Tu es <b>Voleur</b>, dans l’équipe du village. Cette nuit, tu pourras échanger ta carte avec celle d’un autre joueur, puis regarder ta nouvelle carte. Retiens bien ton rôle : au matin, on ne regarde plus sa carte.
        </>
      ) : (
        <>Voici ta carte. Garde le doigt appuyé dessus pour la regarder : personne d’autre ne doit voir ton écran.</>
      );
      action = { label: seen ? 'J’ai vu ma carte' : 'Regarde d’abord ta carte', disabled: !seen };
      break;
    case 'roles':
      content = (
        <div className="tuto-center">
          <h2 className="stage-title">Les rôles en jeu</h2>
          <div className="tuto-roles">
            {IN_PLAY.map((r, i) => (
              <Card key={i} role={r} size="sm" onClick={() => setRoleSheet(r)} label={`${ROLE_INFO[r].name} : la fiche`} />
            ))}
          </div>
          <p className="muted small">Touche une carte pour lire sa fiche.</p>
        </div>
      );
      coach = (
        <>
          Tout le monde connaît les rôles en jeu : ici <b>7 cartes pour 4 joueurs</b>. Les 3 de trop restent face cachée <b>au centre</b>, et personne ne sait lesquelles. Le chiffre en haut d’une carte, c’est son ordre de réveil la nuit.
        </>
      );
      break;
    case 'night':
      content = (
        <div className="stage night">
          {narrator}
          <section className="night-status is-asleep">
            <span className="awake-title">Tu dors…</span>
          </section>
          {nightSpread}
        </div>
      );
      coach = (
        <>
          La nuit, l’appli appelle les rôles un par un. Ce n’est pas ton tour : tu dors… mais <b>touche quand même des cartes</b>. De loin, personne ne peut deviner qui agit vraiment.
        </>
      );
      action = { label: phase >= 2 ? 'Suite' : 'Les rôles se réveillent…', disabled: phase < 2 };
      break;
    case 'voleur':
      content = (
        <div className="stage night">
          {narrator}
          <section className="night-status is-awake">
            <span className="awake-card">
              <Card role="voleur" size="xs" />
            </span>
            <div>
              <b className="awake-title">{stolenUp ? 'Ta nouvelle carte' : 'Prends la carte d’un joueur'}</b>
              <p className="small">{stolenUp ? visionText(EVENTS[3].vision, name, 'moi') : 'Pour ce tutoriel, touche la carte de Léo.'}</p>
            </div>
          </section>
          {nightSpread}
        </div>
      );
      coach = stolenUp ? (
        <>
          La carte de Léo était un <b>Loup-Garou</b> : tu es maintenant Loup-Garou, dans l’équipe de la meute ! Léo a reçu ta carte de Voleur sans le savoir : il croit toujours être Loup-Garou.
        </>
      ) : (
        <>À toi ! Le Voleur échange sa carte avec celle d’un autre joueur, puis regarde ce qu’il a pris. Ce qui s’illumine, tu peux le toucher.</>
      );
      action = { label: 'Suite', disabled: !stolenUp };
      break;
    case 'noiseuse':
      content = (
        <div className="stage night">
          {narrator}
          <section className="night-status is-asleep">
            <span className="awake-title">Tu dors…</span>
          </section>
          {nightSpread}
        </div>
      );
      coach = (
        <>
          Personne ne se réveille : la Noiseuse est au centre. L’appli l’appelle quand même, aussi longtemps que les autres, sinon on devinerait qu’elle n’est pas en jeu. Et ta carte ? Plus rien ne s’affiche : retiens ce que tu as vu.
        </>
      );
      action = { label: 'Le jour se lève' };
      break;
    case 'day':
      content = (
        <div className="stage day">
          {narrator}
          <section className="panel">{shown ? feed : <p className="feed-empty">Tout le monde ouvre les yeux…</p>}</section>
        </div>
      );
      coach =
        shown < CLAIMS.length ? (
          <>Chacun dit son rôle… ou ment. Écoute bien.</>
        ) : (
          <>
            Ce que tu sais, toi : la carte de Léo était un Loup-Garou <b>quand tu l’as prise</b>. Mila dit donc vrai… mais le Loup-Garou, maintenant, <b>c’est toi</b>. Pour gagner avec la meute, aucun Loup-Garou ne doit mourir au vote.
          </>
        );
      action = { label: 'À toi de parler', disabled: shown < CLAIMS.length };
      break;
    case 'claim':
      content = (
        <div className="stage day">
          {!choice && (
            <section className="tuto-choices" aria-label="Ton annonce">
              <h2 className="stage-title">Que dis-tu à la table ?</h2>
              {(['honest', 'villageois', 'sam'] as Choice[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  className="tuto-choice"
                  onClick={() => {
                    setChoice(c);
                    sfx.claim();
                  }}
                >
                  <small>{CHOICE_NOTE[c]}</small>« {claimText(MY_CLAIM[c], name)} »
                </button>
              ))}
            </section>
          )}
          <section className="panel">{feed}</section>
        </div>
      );
      coach = choice ? (
        <>Les autres réagissent. Dans une vraie partie, vous parlez à voix haute, et le bouton « Annoncer » affiche ton annonce pour toute la table (bots compris).</>
      ) : (
        <>Tu peux dire la vérité… ou mentir, comme tout bon Loup-Garou. Choisis une annonce.</>
      );
      action = { label: 'Passer au vote', disabled: !choice || reacted < REACTIONS[choice].length };
      break;
    case 'vote':
      content = (
        <div className="stage vote">
          <h2 className="stage-title">Qui doit mourir ?</h2>
          <div className="vote-grid">
            {['leo', 'mila', 'sam'].map((id) => {
              const c = [...CLAIMS, ...(choice ? [MY_CLAIM[choice]] : [])].find((x) => x.by === id);
              return (
                <button key={id} type="button" className={cls('vote-tile', vote === id && 'is-on')} aria-pressed={vote === id} onClick={() => (setVote(id), sfx.tap())}>
                  <Avatar avatar={NPC[id].avatar} className="vote-avatar" />
                  <b>{NPC[id].name}</b>
                  {c?.role && (
                    <span className="claim-chip">
                      <RoleArt role={c.role} className="claim-chip-art" />
                      {ROLE_INFO[c.role].name}
                    </span>
                  )}
                  {vote === id && <span className="vote-mark">Ton vote</span>}
                </button>
              );
            })}
          </div>
        </div>
      );
      coach = (
        <>
          Chacun vote en secret, puis tout est dévoilé d’un coup. Le joueur qui a le plus de voix meurt (à égalité, tous les ex æquo). Rappel : <b>tu es Loup-Garou</b>.
        </>
      );
      action = { label: 'Dévoiler les votes', disabled: !vote };
      break;
    case 'reveal':
      content = final && <RevealBody final={final} me="moi" name={name} onDone={() => setVerdict(true)} />;
      coach = !verdict ? (
        <>Comme à une vraie table : chacun montre du doigt, les voix sont comptées, puis toutes les cartes se retournent…</>
      ) : iWon ? (
        <>Bravo : aucun Loup-Garou n’est mort, la meute gagne… et toi avec ! Plus bas, « Pourquoi ce résultat ? » explique tout, et la nuit se rejoue pas à pas.</>
      ) : (
        <>Perdu cette fois ! Plus bas, « Pourquoi ce résultat ? » explique tout, et la nuit se rejoue pas à pas : regarde ce que chacun a fait.</>
      );
      action = { label: 'Ce qu’il faut retenir', disabled: !verdict };
      break;
    case 'lessons':
      content = (
        <div className="tuto-lessons">
          <h2 className="stage-title">Ce qu’il faut retenir</h2>
          <ol className="lessons">
            <li>
              <b>C’est la carte de la fin qui compte.</b> Tu as reçu le Voleur et fini Loup-Garou. Léo croyait être Loup-Garou : il a fini Voleur, dans le village.
            </li>
            <li>
              <b>Les Loups-Garous mentent… parfois sans le savoir.</b> Léo s’est dit Noiseuse pour se cacher, alors qu’il n’était déjà plus Loup-Garou.
            </li>
            <li>
              <b>Croise les récits, dans l’ordre de la nuit.</b> Mila a vu juste, mais avant le passage du Voleur. Une carte vue a pu changer de main ensuite.
            </li>
          </ol>
          <p className="tuto-memo">
            <b>Mémo :</b> le village gagne si un Loup-Garou meurt. Aucun Loup-Garou parmi vous ? Votez chacun pour votre voisin : personne ne meurt, et le village gagne. Les rôles spéciaux (Chasseur, Tanneur, Sbire…) ont leur fiche dans les règles.
          </p>
          <div className="tuto-end">
            {inRoom ? (
              <Button variant="primary" className="btn-lg" onClick={close}>
                Retour au salon
              </Button>
            ) : (
              <>
                <Button variant="primary" className="btn-lg" icon={<Bot size={20} />} onClick={() => void play(true)}>
                  Jouer contre des bots
                </Button>
                <Button icon={<Plus size={18} />} onClick={() => void play(false)}>
                  Créer une table entre amis
                </Button>
                <Button variant="ghost" onClick={close}>
                  Fermer
                </Button>
              </>
            )}
          </div>
        </div>
      );
      action = null;
      break;
  }

  return (
    <div className="tutorial" role="dialog" aria-modal="true" aria-label="Apprendre en 2 minutes">
      <Scene mood={MOOD[step]} className="tuto-scene">
        <header className="tuto-top">
          <span className="tuto-badge">
            <GraduationCap size={16} aria-hidden /> Apprendre en 2 minutes
          </span>
          <span className="tuto-progress" aria-label={`Étape ${idx + 1} sur ${STEPS.length}`}>
            <span style={{ transform: `scaleX(${(idx + 1) / STEPS.length})` }} />
          </span>
          <button type="button" className="icon-btn" aria-label="Fermer le tutoriel" onClick={close}>
            <X size={20} />
          </button>
        </header>
        <div ref={body} className="tuto-body">
          <AnimatePresence mode="wait">
            <motion.div key={step} className="tuto-step" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.28 }}>
              {content}
            </motion.div>
          </AnimatePresence>
        </div>
        {(coach || action) && (
          <footer className="coach">
            {coach && (
              <motion.p key={`${step}-${seen}-${stolenUp}-${shown}-${!!choice}-${verdict}`} className="coach-text" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                {coach}
              </motion.p>
            )}
            {action && (
              <Button variant="primary" className="coach-next" icon={<ChevronRight size={20} />} disabled={action.disabled} onClick={action.onClick ?? next}>
                {action.label}
              </Button>
            )}
          </footer>
        )}
      </Scene>
    </div>
  );
}
