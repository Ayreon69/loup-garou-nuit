// Salon : inviter (code, lien, QR), les joueurs et les bots, le choix des cartes (scénarios prêts à jouer ou sur mesure),
// le débat (à voix haute ou par écrit), sa durée, le rythme de la nuit et les conseils. La voix du narrateur se règle par téléphone.
import { motion } from 'framer-motion';
import { BookOpen, Bot, Check, Copy, Crown, GraduationCap, LogOut, Minus, Play, Plus, QrCode, Share2, Shuffle, Trophy, UserX } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { BOX, DAY_TIMERS, MAX_PLAYERS, MIN_PLAYERS, ROLES, type DaySetting, type Pace, type PlayerView, type Role, type RoomView, type ScenarioId, type Settings, type Talk } from '../../../shared/protocol';
import { ROLE_INFO, SCENARIOS, compositionProblem, countOf, recipeFor, scenarioOf, sortRoles } from '../../../shared/roles';
import { RoleArt } from '../components/Art';
import { Avatar, Button, Logo, Modal, Pill, Scene, Segmented, Toggle } from '../components/Ui';
import { DAY_LABEL, DAY_SUB } from '../lib/text';
import { cls, shareUrl } from '../lib/util';
import { voiceSupported } from '../lib/voice';
import { leaveRoom, send } from '../net';
import { useStore } from '../store';

/** La composition affichée dans le salon, et ce qui empêche de lancer. */
function lobbyComposition(s: Settings, n: number): { roles: Role[] | null; problem: string | null; shownFor: number } {
  const shownFor = Math.max(n, MIN_PLAYERS);
  if (s.scenario === 'hasard') return { roles: null, problem: null, shownFor };
  if (s.scenario === 'mesure') return { roles: sortRoles(s.custom), problem: compositionProblem(s.custom, shownFor), shownFor };
  const sc = scenarioOf(s.scenario);
  const roles = recipeFor(s.scenario, shownFor);
  if (!roles) return { roles: recipeFor(s.scenario, Math.min(sc.max, Math.max(sc.min, shownFor))), problem: `« ${sc.name} » se joue de ${sc.min} à ${sc.max} joueurs.`, shownFor };
  return { roles, problem: null, shownFor };
}

function PlayerRow({ view, p, i, isHost }: { view: RoomView; p: PlayerView; i: number; isHost: boolean }) {
  return (
    <motion.li className={cls('player-row', p.id === view.me && 'is-me')} initial={{ x: -10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.03 }}>
      <Avatar avatar={p.avatar} className="player-avatar" />
      <span className="player-name">
        {p.name}
        {p.id === view.me && <span className="muted"> (toi)</span>}
      </span>
      <span className="player-tags">
        {p.wins > 0 && (
          <Pill tone="gold">
            <Trophy size={12} aria-hidden /> {p.wins}
          </Pill>
        )}
        {p.isHost && (
          <Pill tone="ink">
            <Crown size={12} aria-hidden /> Hôte
          </Pill>
        )}
        {p.isBot && <Pill tone="soft">Bot</Pill>}
        {!p.connected && <Pill>Hors ligne</Pill>}
      </span>
      {isHost && p.id !== view.me && (
        <button type="button" className="icon-btn" aria-label={`Retirer ${p.name}`} onClick={() => void send('room:kick', { playerId: p.id })}>
          <UserX size={18} />
        </button>
      )}
    </motion.li>
  );
}

function Pips({ level }: { level: number }) {
  return (
    <span className="pips" aria-label={`Difficulté ${level} sur 4`}>
      {[1, 2, 3, 4].map((i) => (
        <i key={i} className={cls(i <= level && 'is-on')} />
      ))}
    </span>
  );
}

/** Les cartes de la partie, regroupées : touche-en une pour sa fiche. */
function Composition({ roles }: { roles: Role[] }) {
  const open = useStore((s) => s.setRoleSheet);
  const groups = [...new Set(roles)].map((r) => [r, countOf(roles, r)] as const);
  return (
    <div className="compo">
      {groups.map(([r, n]) => (
        <button key={r} type="button" className={cls('compo-card', `team-${ROLE_INFO[r].team}`)} onClick={() => open(r)} aria-label={`${ROLE_INFO[r].name}${n > 1 ? ` ×${n}` : ''} : la fiche`}>
          <RoleArt role={r} className="compo-art" />
          <span className="compo-name">{ROLE_INFO[r].name}</span>
          {n > 1 && <b className="compo-n">×{n}</b>}
        </button>
      ))}
    </div>
  );
}

function CustomPicker({ custom, need, disabled }: { custom: Role[]; need: number; disabled: boolean }) {
  const set = (r: Role, d: number) => {
    const next = [...custom];
    if (d > 0) next.push(r);
    else next.splice(next.lastIndexOf(r), 1);
    void send('room:settings', { custom: sortRoles(next) });
  };
  return (
    <div className="custom">
      <p className={cls('custom-count', custom.length === need && 'is-ok')}>
        {custom.length} / {need} cartes {custom.length === need ? <Check size={16} aria-hidden /> : null}
      </p>
      <ul className="custom-list">
        {ROLES.map((r) => {
          const n = countOf(custom, r);
          return (
            <li key={r} className={cls('custom-row', n > 0 && 'is-on')}>
              <RoleArt role={r} className="custom-art" />
              <span className="custom-name">{ROLE_INFO[r].name}</span>
              <span className="stepper" role="group" aria-label={ROLE_INFO[r].name}>
                <button type="button" className="icon-btn" aria-label={`Un ${ROLE_INFO[r].name} de moins`} disabled={disabled || n === 0} onClick={() => set(r, -1)}>
                  <Minus size={14} />
                </button>
                <b className="custom-n">{n}</b>
                <button type="button" className="icon-btn" aria-label={`Un ${ROLE_INFO[r].name} de plus`} disabled={disabled || n >= BOX[r]} onClick={() => set(r, 1)}>
                  <Plus size={14} />
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Lobby({ view }: { view: RoomView }) {
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const setTutorialOpen = useStore((s) => s.setTutorialOpen);
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const isHost = view.hostId === view.me;
  const seated = view.players.filter((p) => p.status !== 'spectator');
  const spectators = view.players.filter((p) => p.status === 'spectator');
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState(false);
  const url = shareUrl(view.code);
  const host = view.players.find((p) => p.id === view.hostId);
  const s = view.settings;
  const n = seated.length;
  const compo = lobbyComposition(s, n);
  const blocked = n < MIN_PLAYERS ? `Il faut au moins ${MIN_PLAYERS} joueurs` : compo.problem;
  const voiceOn = voiceSupported() && (prefs.voice ?? isHost);

  const set = (patch: Partial<Settings>) => void send('room:settings', patch as Record<string, unknown>);
  const pickScenario = (id: ScenarioId) => {
    if (id === 'mesure' && !s.custom.length) {
      const from = compo.roles ?? recipeFor('premiere', compo.shownFor) ?? [];
      set({ scenario: id, custom: from });
    } else set({ scenario: id });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      useStore.getState().showToast(`Lien : ${url}`, 'info');
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Loup-Garou pour une Nuit', text: `Rejoins ma table de Loup-Garou pour une Nuit (code ${view.code}) !`, url });
      } catch {
        /* partage annulé */
      }
    } else void copy();
  };

  return (
    <Scene mood="night" className="lobby-screen">
      <div className="lobby">
        <header className="topbar lobby-top">
          <Logo size="sm" />
          <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
            Quitter
          </Button>
        </header>

        <motion.section className="code-panel" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <span className="eyebrow">Code de la table</span>
          <div className="big-code" aria-label={`Code ${view.code.split('').join(' ')}`}>
            {view.code.split('').map((c, i) => (
              <motion.span key={i} initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.07, type: 'spring', stiffness: 240, damping: 16 }}>
                {c}
              </motion.span>
            ))}
          </div>
          <div className="share-row">
            <Button variant="primary" icon={<Share2 size={18} />} onClick={share}>
              Inviter
            </Button>
            <Button icon={copied ? <Check size={18} /> : <Copy size={18} />} onClick={copy}>
              {copied ? 'Lien copié !' : 'Copier le lien'}
            </Button>
            <Button icon={<QrCode size={18} />} onClick={() => setQr(true)} aria-label="Afficher le QR code" title="QR code" />
          </div>
        </motion.section>

        <div className="lobby-grid">
          <section className="panel">
            <div className="panel-head">
              <h3>
                Joueurs <span className="muted">{n}/{MAX_PLAYERS}</span>
              </h3>
              {isHost && (
                <Button variant="soft" icon={<Bot size={18} />} disabled={n >= MAX_PLAYERS} onClick={() => void send('room:addBot')}>
                  Ajouter un bot
                </Button>
              )}
            </div>
            <ul className="player-list">
              {seated.map((p, i) => (
                <PlayerRow key={p.id} view={view} p={p} i={i} isHost={isHost} />
              ))}
              {Array.from({ length: Math.max(0, MIN_PLAYERS - n) }, (_, i) => (
                <li key={`empty${i}`} className="player-row is-empty">
                  <span className="player-ghost">?</span>
                  <span className="player-name muted">En attente d’un joueur…</span>
                </li>
              ))}
            </ul>
            {spectators.length > 0 && <p className="muted small">Spectateurs : {spectators.map((p) => p.name).join(', ')}</p>}
            <p className="muted small lobby-note">De 3 à 10 joueurs. Les bots lisent les annonces… et mentent quand ils sont Loups-Garous.</p>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h3>Les cartes</h3>
              {!isHost && <span className="muted small">choisies par {host?.name ?? 'l’hôte'}</span>}
            </div>
            <div className="scenarios" role="radiogroup" aria-label="Scénario">
              {SCENARIOS.map((sc) => {
                const fits = sc.id === 'hasard' || sc.id === 'mesure' || (compo.shownFor >= sc.min && compo.shownFor <= sc.max);
                return (
                  <button
                    key={sc.id}
                    type="button"
                    role="radio"
                    aria-checked={s.scenario === sc.id}
                    disabled={!isHost}
                    className={cls('scenario', s.scenario === sc.id && 'is-on', !fits && 'is-off')}
                    onClick={() => pickScenario(sc.id)}
                  >
                    <span className="scenario-head">
                      <b>{sc.name}</b>
                      <Pips level={sc.level} />
                    </span>
                    <small>{sc.blurb}</small>
                    <span className="scenario-range">{sc.min === 3 && sc.max === 10 ? '3 à 10 joueurs' : `${sc.min} à ${sc.max} joueurs`}</span>
                  </button>
                );
              })}
            </div>
            <div className="compo-box">
              <span className="field-label">
                {s.scenario === 'hasard' ? 'Composition' : `${compo.shownFor + 3} cartes pour ${compo.shownFor} joueurs (3 au centre)`}
              </span>
              {s.scenario === 'hasard' ? (
                <p className="compo-random">
                  <Shuffle size={18} aria-hidden /> Les cartes seront tirées au sort au lancement, avec au moins un Loup-Garou. Personne ne saura lesquelles sont en jeu avant la distribution.
                </p>
              ) : s.scenario === 'mesure' ? (
                <CustomPicker custom={s.custom} need={compo.shownFor + 3} disabled={!isHost} />
              ) : (
                compo.roles && <Composition roles={compo.roles} />
              )}
              {compo.problem && <p className="compo-problem">{compo.problem}</p>}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h3>Réglages</h3>
            </div>
            <span className="field-label">Le débat</span>
            <Segmented<Talk>
              label="Le débat"
              value={s.talk}
              disabled={!isHost}
              onChange={(talk) => set({ talk })}
              options={[
                { value: 'oral', label: 'À voix haute', sub: 'à table ou en visio' },
                { value: 'ecrit', label: 'Par écrit', sub: 'fil de discussion' },
              ]}
            />
            <span className="field-label">Durée du débat</span>
            <Segmented<DaySetting> label="Durée du débat" value={s.day} disabled={!isHost} onChange={(day) => set({ day })} options={DAY_TIMERS.map((d) => ({ value: d, label: DAY_LABEL[d], sub: DAY_SUB[d] }))} />
            <span className="field-label">La nuit</span>
            <Segmented<Pace>
              label="Rythme de la nuit"
              value={s.pace}
              disabled={!isHost}
              onChange={(pace) => set({ pace })}
              options={[
                { value: 'posee', label: 'Posée', sub: '18 s par rôle' },
                { value: 'normale', label: 'Normale', sub: '12 s par rôle' },
              ]}
            />
            <Toggle on={s.tips} disabled={!isHost} onChange={(tips) => set({ tips })} label="Conseils pour débutants" sub="à chaque étape de la partie" />
            {voiceSupported() && <Toggle on={voiceOn} onChange={(voice) => setPrefs({ voice })} label="Voix du narrateur" sub="sur ce téléphone (par défaut, chez l’hôte)" />}
          </section>
        </div>

        <div className="lobby-cta">
          {isHost ? (
            <Button variant="primary" className="btn-lg btn-wide" icon={<Play size={20} />} disabled={!!blocked} onClick={() => void send('game:start')}>
              {blocked ?? `Lancer la partie (${n} joueurs)`}
            </Button>
          ) : (
            <div className="waiting" role="status">
              <span className="spinner" /> En attente que {host?.name ?? 'l’hôte'} lance la partie…
            </div>
          )}
          <div className="lobby-help">
            <Button variant="ghost" icon={<GraduationCap size={18} />} onClick={() => setTutorialOpen(true)}>
              Apprendre en 2 minutes
            </Button>
            <Button variant="ghost" icon={<BookOpen size={18} />} onClick={() => setRulesOpen(true)}>
              Les règles
            </Button>
          </div>
        </div>

        <Modal open={qr} onClose={() => setQr(false)} title={`Table ${view.code}`}>
          <div className="qr-box">
            <QRCodeSVG value={url} size={220} bgColor="#f7ecd6" fgColor="#16142b" level="M" includeMargin />
            <p className="muted small">Scanne pour rejoindre la table directement.</p>
            <code className="url-code">{url}</code>
          </div>
        </Modal>
      </div>
    </Scene>
  );
}
