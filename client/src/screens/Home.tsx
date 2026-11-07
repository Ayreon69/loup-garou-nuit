// Accueil : le titre devant la lune, trois cartes dont une change sans cesse de visage, le tutoriel bien en vue,
// puis pseudo et avatar, créer ou rejoindre une table, jouer contre des bots, et les règles.
import { motion } from 'framer-motion';
import { BookOpen, Bot, GraduationCap, House, LogIn, MessageSquare, Minus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AVATARS, MAX_PLAYERS, MIN_PLAYERS, type Role } from '../../../shared/protocol';
import { Card } from '../components/Card';
import { AVATAR_EMOJI, AVATAR_LABELS, Button, Logo, Scene } from '../components/Ui';
import { BOTS_KEY, cls, reducedMotion, savedBots } from '../lib/util';
import { codeFromUrl, createRoom, joinRoom } from '../net';
import { useStore } from '../store';

const MAX_BOTS = MAX_PLAYERS - 1;
const MIN_BOTS = MIN_PLAYERS - 1;
const FACES: Role[] = ['loup', 'villageois', 'voyante', 'noiseuse', 'loup', 'chasseur', 'voleur', 'tanneur', 'insomniaque', 'soulard'];

/** Trois cartes en éventail : celle du milieu se retourne, se recache, et revient avec un autre rôle. */
function HeroFan() {
  const still = reducedMotion();
  const [n, setN] = useState(0);
  const [up, setUp] = useState(still);
  useEffect(() => {
    if (still) return;
    const t = window.setTimeout(
      () => {
        if (up) setUp(false);
        else {
          setN((x) => (x + 1) % FACES.length);
          setUp(true);
        }
      },
      up ? 2200 : 900,
    );
    return () => window.clearTimeout(t);
  }, [up, still]);
  return (
    <div className="hero-fan" aria-hidden>
      <Card size="md" up={false} className="fan-left" />
      <Card role={FACES[n]} size="md" up={up} className="fan-mid" />
      <Card size="md" up={false} className="fan-right" />
    </div>
  );
}

export function Home() {
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const setTutorialOpen = useStore((s) => s.setTutorialOpen);
  const conn = useStore((s) => s.conn);
  const [invited, setInvited] = useState(codeFromUrl);
  const [code, setCode] = useState('');
  const [bots, setBots] = useState(savedBots);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => setInvited(codeFromUrl());
    window.addEventListener('ln:url', sync);
    return () => window.removeEventListener('ln:url', sync);
  }, []);
  const nameOk = profile.name.trim().length > 0;

  const run = async (key: string, fn: () => Promise<boolean>) => {
    if (busy) return;
    if (!nameOk) {
      useStore.getState().showToast('Choisis d’abord un pseudo.', 'info');
      document.getElementById('pseudo')?.focus();
      return;
    }
    setBusy(key);
    await fn();
    setBusy(null);
  };

  const changeBots = (d: number) => {
    const n = Math.max(MIN_BOTS, Math.min(MAX_BOTS, bots + d));
    setBots(n);
    try {
      localStorage.setItem(BOTS_KEY, String(n));
    } catch {
      /* stockage indisponible */
    }
  };

  const cleanCode = code.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4);

  return (
    <Scene mood="night" className="home">
      <nav className="home-links">
        <a className="all-games" href="https://akhis-games.onrender.com">
          <House size={16} aria-hidden /> Tous les jeux
        </a>
        <a className="all-games" href="https://akhis-games.onrender.com/feedback.html?jeu=loup-garou">
          <MessageSquare size={16} aria-hidden /> Feedback
        </a>
      </nav>
      <header className="home-hero">
        <motion.div initial={{ y: -14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.6 }}>
          <Logo size="lg" />
        </motion.div>
        <p className="tagline">
          Une nuit, un débat, un vote. Démasque un <b>Loup-Garou</b>… mais méfie-toi : cette nuit, <b>les cartes changent de main</b>, et ton rôle avec.
        </p>
        <HeroFan />
      </header>

      <motion.button type="button" className="learn-card" onClick={() => setTutorialOpen(true)} initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1, duration: 0.45 }}>
        <span className="learn-icon">
          <GraduationCap size={26} aria-hidden />
        </span>
        <span className="learn-text">
          <b>Jamais joué ? Apprends en 2 minutes</b>
          <small>Une petite partie guidée : tu joues, l’appli t’explique.</small>
        </span>
      </motion.button>

      <motion.section className="panel home-panel" initial={{ y: 26, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.18, duration: 0.45 }}>
        {invited && (
          <div className="invite-banner">
            Invitation à la table <b>{invited}</b> : choisis ton pseudo et entre !
          </div>
        )}
        <label className="field-label" htmlFor="pseudo">
          Ton pseudo
        </label>
        <input
          id="pseudo"
          className="input input-lg"
          placeholder="Ex. Brume"
          value={profile.name}
          maxLength={16}
          autoComplete="nickname"
          onChange={(e) => setProfile({ name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && invited) void run('join', () => joinRoom(invited));
          }}
        />
        <span className="field-label" id="avatar-label">
          Ton avatar
        </span>
        <div className="avatar-picker" role="radiogroup" aria-labelledby="avatar-label">
          {AVATARS.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={profile.avatar === a} aria-label={AVATAR_LABELS[a]} className={cls('avatar-opt', profile.avatar === a && 'is-on')} onClick={() => setProfile({ avatar: a })}>
              {AVATAR_EMOJI[a]}
            </button>
          ))}
        </div>

        {invited ? (
          <div className="home-actions">
            <Button variant="primary" className="btn-lg" icon={<LogIn size={20} />} disabled={!!busy} onClick={() => run('join', () => joinRoom(invited))}>
              {busy === 'join' ? 'Connexion…' : `Rejoindre la table ${invited}`}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                window.history.replaceState(null, '', '/');
                setInvited(null);
              }}
            >
              Créer ma propre table à la place
            </Button>
          </div>
        ) : (
          <div className="home-actions">
            <Button variant="primary" className="btn-lg" icon={<Plus size={20} />} disabled={!!busy} onClick={() => run('create', () => createRoom())}>
              {busy === 'create' ? 'Création…' : 'Créer une table'}
            </Button>
            <div className="join-row">
              <input
                className="input code-input"
                placeholder="CODE"
                value={cleanCode}
                maxLength={4}
                aria-label="Code de la table"
                autoCapitalize="characters"
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && cleanCode.length === 4) void run('join', () => joinRoom(cleanCode));
                }}
              />
              <Button icon={<LogIn size={18} />} disabled={cleanCode.length !== 4 || !!busy} onClick={() => run('join', () => joinRoom(cleanCode))}>
                Rejoindre
              </Button>
            </div>
            <div className="bots-row">
              <Button className="bots-go" icon={<Bot size={18} />} disabled={!!busy} onClick={() => run('bots', () => createRoom({ bots, autostart: true }))}>
                {busy === 'bots' ? 'Préparation…' : `Jouer contre ${bots} bots`}
              </Button>
              <div className="stepper" role="group" aria-label="Nombre de bots">
                <button type="button" className="icon-btn" aria-label="Un bot de moins" disabled={bots <= MIN_BOTS} onClick={() => changeBots(-1)}>
                  <Minus size={16} />
                </button>
                <button type="button" className="icon-btn" aria-label="Un bot de plus" disabled={bots >= MAX_BOTS} onClick={() => changeBots(1)}>
                  <Plus size={16} />
                </button>
              </div>
            </div>
          </div>
        )}
        <Button variant="ghost" className="rules-link" icon={<BookOpen size={18} />} onClick={() => setRulesOpen(true)}>
          Les règles et les rôles
        </Button>
        {conn !== 'online' && (
          <p className="wake-note" role="status">
            <span className="spinner" /> Réveil du serveur… (jusqu’à une minute la première fois)
          </p>
        )}
      </motion.section>

      <footer className="home-foot">
        De 3 à 10 joueurs, en 10 minutes, autour d’une table ou en visio. D’après le jeu de Ted Alspach et Akihisa Okui. Création de fans, non officielle. Voix du narrateur : ElevenLabs.
      </footer>
    </Scene>
  );
}
