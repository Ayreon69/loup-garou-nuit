// Annoncer à toute la table, en quelques touches : son rôle (avec ce qu'on a vu), un soupçon, ou « aucun Loup parmi nous ».
// Les bots lisent ces annonces ; à voix haute, on peut en dire bien plus. Rien n'oblige à dire la vérité.
import { Megaphone, MoonStar, Search, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Claim, ClaimKind, Role, RoomView } from '../../../shared/protocol';
import { CENTER_NAME, ROLE_INFO, claimText } from '../../../shared/roles';
import { realName } from '../lib/text';
import { cls } from '../lib/util';
import { send } from '../net';
import { RoleArt } from './Art';
import { Avatar, Button, Modal } from './Ui';

type Draft = { kind: ClaimKind; role?: Role; players: string[]; center: number[]; saw: Role[]; alone: boolean; mode?: 'player' | 'center' };

const EMPTY: Draft = { kind: 'role', players: [], center: [], saw: [], alone: false };

/** Ce que chaque rôle peut préciser. */
const DETAIL: Partial<Record<Role, string>> = {
  voyante: 'Ce que tu as vu',
  voleur: 'La carte que tu as prise',
  noiseuse: 'Les deux joueurs échangés',
  soulard: 'La carte du centre que tu as prise',
  insomniaque: 'Ta carte au réveil',
  macon: 'L’autre Franc-Maçon',
  doppel: 'Le joueur copié',
  loup: 'Les autres Loups-Garous',
  sbire: 'Les Loups-Garous que tu as vus',
};

function Chips<T extends string | number>({ items, value, onToggle, label, max }: { items: { v: T; label: string; avatar?: string; role?: Role }[]; value: T[]; onToggle: (v: T) => void; label: string; max: number }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {items.map((it) => {
        const on = value.includes(it.v);
        return (
          <button key={String(it.v)} type="button" className={cls('chip', on && 'is-on', it.role && 'chip-role')} aria-pressed={on} disabled={!on && value.length >= max && max > 1} onClick={() => onToggle(it.v)}>
            {it.avatar && <Avatar avatar={it.avatar} className="chip-avatar" />}
            {it.role && <RoleArt role={it.role} className="chip-art" />}
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

export function ClaimBuilder({ view, open, onClose, start }: { view: RoomView; open: boolean; onClose: () => void; start?: ClaimKind }) {
  const g = view.game!;
  const [d, setD] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setD({ ...EMPTY, kind: start ?? 'role' });
  }, [open, start]);

  const others = g.order.filter((id) => id !== view.me).map((id) => view.players.find((p) => p.id === id)!).filter(Boolean);
  const inPlay = useMemo(() => [...new Set(g.roles)], [g.roles]);
  const playerItems = others.map((p) => ({ v: p.id, label: p.name, avatar: p.avatar }));
  const roleItems = inPlay.map((r) => ({ v: r, label: ROLE_INFO[r].name, role: r }));
  const centerItems = [0, 1, 2].map((c) => ({ v: c, label: CENTER_NAME[c].replace(/^(de |du )/, '') }));

  const toggle = <K extends 'players' | 'center' | 'saw'>(key: K, v: Draft[K][number], max: number) =>
    setD((x) => {
      const list = x[key] as (string | number)[];
      const next = list.includes(v) ? list.filter((y) => y !== v) : max === 1 ? [v] : [...list, v].slice(0, max);
      return { ...x, [key]: next, alone: false };
    });

  const payload: Omit<Claim, 'n' | 'by'> = { kind: d.kind, role: d.role, players: d.players, center: d.center, saw: d.saw.filter(Boolean), alone: d.alone };
  const preview = d.kind === 'role' && !d.role ? null : d.kind === 'suspect' && !d.players.length ? null : claimText({ n: 0, by: view.me, ...payload }, realName(view));
  const ready = !!preview;

  const post = async () => {
    if (!ready || busy) return;
    setBusy(true);
    const ok = await send('game:claim', payload as unknown as Record<string, unknown>);
    setBusy(false);
    if (ok) onClose();
  };

  const role = d.role;
  return (
    <Modal open={open} onClose={onClose} title="Annoncer à la table" className="claim-sheet" footer={
      <>
        {preview && <p className="claim-preview">« {preview} »</p>}
        <Button variant="primary" icon={<Megaphone size={18} />} disabled={!ready || busy} onClick={post}>
          Annoncer
        </Button>
      </>
    }>
      <div className="claim-kinds" role="tablist">
        {(
          [
            ['role', 'Mon rôle', <UserRound key="r" size={18} />],
            ['suspect', 'Un soupçon', <Search key="s" size={18} />],
            ['noWolf', 'Aucun Loup ?', <MoonStar key="n" size={18} />],
          ] as const
        ).map(([k, label, icon]) => (
          <button key={k} type="button" role="tab" aria-selected={d.kind === k} className={cls('claim-kind', d.kind === k && 'is-on')} onClick={() => setD({ ...EMPTY, kind: k })}>
            {icon}
            {label}
          </button>
        ))}
      </div>

      {d.kind === 'role' && (
        <>
          <p className="field-label">Tu dis que tu es…</p>
          <div className="claim-roles">
            {inPlay.map((r) => (
              <button key={r} type="button" className={cls('claim-role', role === r && 'is-on')} aria-pressed={role === r} onClick={() => setD({ ...EMPTY, kind: 'role', role: r })}>
                <RoleArt role={r} className="claim-role-art" />
                <span>{ROLE_INFO[r].name}</span>
              </button>
            ))}
          </div>
          {role && DETAIL[role] && (
            <div className="claim-detail">
              <p className="field-label">
                {DETAIL[role]} <span className="muted">(facultatif)</span>
              </p>
              {role === 'voyante' && (
                <>
                  <div className="mini-seg">
                    <button type="button" className={cls(d.mode !== 'center' && 'is-on')} onClick={() => setD({ ...d, mode: 'player', center: [], saw: [] })}>
                      Un joueur
                    </button>
                    <button type="button" className={cls(d.mode === 'center' && 'is-on')} onClick={() => setD({ ...d, mode: 'center', players: [], saw: [] })}>
                      Deux cartes du centre
                    </button>
                  </div>
                  {d.mode !== 'center' ? (
                    <>
                      <Chips label="Le joueur regardé" items={playerItems} value={d.players} max={1} onToggle={(v) => toggle('players', v, 1)} />
                      {d.players.length > 0 && (
                        <>
                          <p className="field-label">Sa carte</p>
                          <Chips label="Sa carte" items={roleItems} value={d.saw} max={1} onToggle={(v) => toggle('saw', v, 1)} />
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="small muted">Les deux rôles vus au centre :</p>
                      <div className="pair-pick">
                        {[0, 1].map((i) => (
                          <select
                            key={i}
                            className="input"
                            aria-label={`Carte ${i + 1} du centre`}
                            value={d.saw[i] ?? ''}
                            onChange={(e) => {
                              const saw = [d.saw[0], d.saw[1]];
                              saw[i] = e.target.value as Role;
                              setD({ ...d, saw: saw as Role[], center: [0, 1] });
                            }}
                          >
                            <option value="">Choisir…</option>
                            {inPlay.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_INFO[r].name}
                              </option>
                            ))}
                          </select>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
              {(role === 'voleur' || role === 'doppel') && (
                <>
                  <Chips label="Le joueur" items={playerItems} value={d.players} max={1} onToggle={(v) => toggle('players', v, 1)} />
                  {d.players.length > 0 && (
                    <>
                      <p className="field-label">{role === 'voleur' ? 'La carte que tu as découverte' : 'Le rôle copié'}</p>
                      <Chips label="Le rôle" items={roleItems.filter((x) => x.v !== 'doppel')} value={d.saw} max={1} onToggle={(v) => toggle('saw', v, 1)} />
                    </>
                  )}
                </>
              )}
              {role === 'noiseuse' && <Chips label="Les deux joueurs" items={playerItems} value={d.players} max={2} onToggle={(v) => toggle('players', v, 2)} />}
              {role === 'soulard' && <Chips label="La carte du centre" items={centerItems} value={d.center} max={1} onToggle={(v) => toggle('center', v, 1)} />}
              {role === 'insomniaque' && <Chips label="Ta carte au réveil" items={roleItems} value={d.saw} max={1} onToggle={(v) => toggle('saw', v, 1)} />}
              {(role === 'macon' || role === 'loup' || role === 'sbire') && (
                <>
                  <Chips label="Les joueurs" items={playerItems} value={d.players} max={role === 'macon' ? 1 : role === 'loup' ? 2 : 3} onToggle={(v) => toggle('players', v, role === 'macon' ? 1 : role === 'loup' ? 2 : 3)} />
                  <button type="button" className={cls('chip', 'chip-alone', d.alone && 'is-on')} aria-pressed={d.alone} onClick={() => setD({ ...d, alone: !d.alone, players: [] })}>
                    {role === 'sbire' ? 'Aucun Loup-Garou' : 'Personne d’autre'}
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}

      {d.kind === 'suspect' && (
        <>
          <p className="field-label">Tu soupçonnes…</p>
          <Chips label="Le suspect" items={playerItems} value={d.players} max={1} onToggle={(v) => toggle('players', v, 1)} />
        </>
      )}

      {d.kind === 'noWolf' && (
        <p className="claim-help">
          Tu penses que tous les Loups-Garous sont au centre ? Propose à chacun de voter pour son voisin (le joueur suivant à table) : chacun reçoit une voix, personne ne meurt, et le village gagne. S’il y a bien un Loup parmi vous, la meute gagne…
        </p>
      )}
    </Modal>
  );
}
