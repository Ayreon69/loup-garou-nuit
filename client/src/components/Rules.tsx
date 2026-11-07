// Les règles, consultables partout : le déroulement en six temps, la galerie des rôles, et des astuces pour débuter.
import { GraduationCap } from 'lucide-react';
import { useState } from 'react';
import { ROLES } from '../../../shared/protocol';
import { ROLE_INFO } from '../../../shared/roles';
import { cls } from '../lib/util';
import { useStore } from '../store';
import { RoleArt } from './Art';
import { Card } from './Card';
import { Button, Modal } from './Ui';

type Tab = 'jeu' | 'roles' | 'astuces';

const STEPS: { title: string; art: (typeof ROLES)[number]; text: string }[] = [
  {
    title: 'Une carte secrète',
    art: 'villageois',
    text: 'De 3 à 10 joueurs. Chacun reçoit une carte et la regarde en secret ; trois cartes restent face cachée au centre. Les rôles en jeu sont connus de tous, mais personne ne sait lesquels sont au centre.',
  },
  {
    title: 'La nuit',
    art: 'insomniaque',
    text: 'Tout le monde ferme les yeux. L’appli appelle les rôles un par un, dans l’ordre de leur numéro. Le rôle appelé se réveille et agit sur son téléphone : regarder une carte, en échanger deux… Les rôles restés au centre sont appelés aussi, pour ne rien trahir.',
  },
  {
    title: 'Ta carte peut changer',
    art: 'voleur',
    text: 'Le Voleur, la Noiseuse et le Soûlard échangent des cartes. Au matin, c’est la carte devant toi qui compte, même si tu ne le sais pas ! Et comme dans le vrai jeu, on ne regarde plus sa carte.',
  },
  {
    title: 'Le jour : le débat',
    art: 'voyante',
    text: 'Tout le monde ouvre les yeux. Chacun dit (ou invente) son rôle et ce qu’il a vu. Les Loups-Garous mentent pour se cacher. Les annonces s’affichent pour toute la table, bots compris.',
  },
  {
    title: 'Le vote',
    art: 'chasseur',
    text: 'Chacun désigne un joueur en secret, puis tout est révélé d’un coup. Le plus de voix meurt ; à égalité, tous les ex æquo meurent. Si chacun reçoit exactement une voix, personne ne meurt.',
  },
  {
    title: 'Qui gagne ?',
    art: 'loup',
    text: 'Le village gagne si au moins un Loup-Garou meurt. La meute gagne si aucun Loup-Garou ne meurt. Aucun Loup-Garou parmi vous (ils sont tous au centre) ? Le village gagne seulement si personne du village ne meurt. Le Tanneur et le Sbire ont leurs propres règles : touche leur carte.',
  },
];

const TIPS = [
  ['Première partie', 'Choisissez « Première nuit », un débat de 10 minutes et une nuit « posée ». Faites le tutoriel avant : 2 minutes suffisent.'],
  ['Pour lancer le débat', 'Demandez simplement à chacun son rôle. On apprend beaucoup, même des menteurs.'],
  ['Une annonce n’est pas une preuve', 'Comparez les récits : qui a vu quoi, et à quel moment de la nuit. Une carte vue par la Voyante a pu être volée ensuite.'],
  ['Tu étais Loup-Garou ?', 'Si le Voleur t’a pris ta carte, tu n’es plus Loup-Garou… mais tu ne le sais pas. Écoute bien ceux qui disent avoir échangé des cartes.'],
  ['Pas de Loup parmi vous ?', 'Si vous pensez qu’ils sont tous au centre, votez chacun pour votre voisin (le joueur suivant à table) : chacun reçoit une voix, personne ne meurt, et le village gagne.'],
  ['Mentir avec style', 'Seul Loup-Garou, annonce la carte que tu as vue au centre : personne ne l’a. Le Soûlard est aussi un bon mensonge, invérifiable.'],
  ['Les bons dosages', 'Les Francs-Maçons à partir de 7 joueurs ; l’Insomniaque seulement avec un Voleur ou une Noiseuse ; le Doppelgänger quand tout le monde connaît les autres rôles.'],
];

export function RulesBody({ initial = 'jeu' }: { initial?: Tab }) {
  const [tab, setTab] = useState<Tab>(initial);
  const openRole = useStore((s) => s.setRoleSheet);
  return (
    <div className="rules">
      <div className="tabs" role="tablist">
        {(
          [
            ['jeu', 'Le jeu'],
            ['roles', 'Les rôles'],
            ['astuces', 'Astuces'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={cls('tab', tab === id && 'is-on')} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'jeu' && (
        <ol className="rule-steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rule-step">
              <span className="rule-art">
                <RoleArt role={s.art} />
                <b>{i + 1}</b>
              </span>
              <div>
                <h4>{s.title}</h4>
                <p>{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
      {tab === 'roles' && (
        <>
          <p className="muted small">Dans l’ordre du réveil. Touche une carte pour tout savoir du rôle.</p>
          <div className="role-gallery">
            {ROLES.map((r) => (
              <div key={r} className="gallery-item">
                <Card role={r} size="sm" onClick={() => openRole(r)} label={`${ROLE_INFO[r].name} : la fiche`} />
                <span>{ROLE_INFO[r].short}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {tab === 'astuces' && (
        <ul className="tips">
          {TIPS.map(([t, d]) => (
            <li key={t}>
              <b>{t}</b>
              <span>{d}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RulesModal() {
  const open = useStore((s) => s.rulesOpen);
  const setOpen = useStore((s) => s.setRulesOpen);
  const setTutorial = useStore((s) => s.setTutorialOpen);
  const inGame = useStore((s) => s.view?.phase === 'playing');
  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Les règles"
      wide
      footer={
        !inGame && (
          <Button
            variant="primary"
            icon={<GraduationCap size={18} />}
            onClick={() => {
              setOpen(false);
              setTutorial(true);
            }}
          >
            Apprendre en jouant (2 min)
          </Button>
        )
      }
    >
      <RulesBody />
    </Modal>
  );
}
