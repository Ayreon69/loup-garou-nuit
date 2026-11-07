// Les silhouettes du théâtre d'ombres : chaque rôle est une figurine noire découpée, devant un écran éclairé par la lanterne.
import type { ReactNode } from 'react';
import type { Role } from '../../../shared/protocol';

const INK = 'var(--shadow)';
const GLOW = 'var(--glow)';

/** Les figurines, dessinées sur 100 × 100. */
const FIGURES: Record<Role, ReactNode> = {
  loup: (
    <>
      <path d="M22 97 L27 71 L24 53 L30 39 L32 15 L41 29 L48 28 L61 19 L84 6 L81 15 L71 24 L83 25 L71 31 L65 33 L67 46 L62 58 L67 75 L60 97 Z" fill={INK} />
      <path d="M46 35 L54 32.5 L50.5 37.5 Z" fill={GLOW} />
    </>
  ),
  villageois: (
    <>
      <path d="M17 91 L17 54 L50 25 L83 54 L83 91 Z" fill={INK} />
      <path d="M64 41 L64 26 L73 26 L73 49 Z" fill={INK} />
      <circle cx="70" cy="18" r="3.4" fill={INK} opacity="0.55" />
      <circle cx="75" cy="10" r="2.4" fill={INK} opacity="0.4" />
      <path d="M45 58 H59 V71 H45 Z" fill={GLOW} />
      <path d="M52 58 V71 M45 64.5 H59" stroke={INK} strokeWidth="2" />
      <path d="M25 70 H37 V91 H25 Z" fill={GLOW} opacity="0.55" />
    </>
  ),
  voyante: (
    <>
      <circle cx="50" cy="44" r="25" fill={INK} />
      <path d="M29 44 Q50 27 71 44 Q50 61 29 44 Z" fill={GLOW} />
      <circle cx="50" cy="44" r="7" fill={INK} />
      <circle cx="52.5" cy="41.5" r="2" fill={GLOW} />
      <path d="M36 67 H64 L70 81 H30 Z" fill={INK} />
      <path d="M23 81 H77 V88 H23 Z" fill={INK} />
      <path d="M15 20 l2.2 6 l6 2.2 l-6 2.2 l-2.2 6 l-2.2 -6 l-6 -2.2 l6 -2.2 Z" fill={INK} />
      <path d="M85 60 l1.6 4.4 l4.4 1.6 l-4.4 1.6 l-1.6 4.4 l-1.6 -4.4 l-4.4 -1.6 l4.4 -1.6 Z" fill={INK} />
    </>
  ),
  voleur: (
    <>
      <path d="M21 35 Q50 3 79 35 Q50 26 21 35 Z" fill={INK} />
      <path d="M10 48 Q28 32 50 43 Q72 32 90 48 Q88 66 68 66 Q56 66 50 58 Q44 66 32 66 Q12 66 10 48 Z" fill={INK} />
      <ellipse cx="32" cy="51" rx="8.5" ry="5.2" fill={GLOW} />
      <ellipse cx="68" cy="51" rx="8.5" ry="5.2" fill={GLOW} />
      <path d="M10 48 L1 42 L3 55 Z M90 48 L99 42 L97 55 Z" fill={INK} />
      <path d="M40 76 L60 76 L57 90 L43 90 Z" fill={INK} opacity="0.5" />
    </>
  ),
  noiseuse: (
    <>
      <path d="M15 46 Q20 17 55 17 L55 8 L75 24 L55 40 L55 31 Q30 31 26 46 Z" fill={INK} />
      <path d="M85 54 Q80 83 45 83 L45 92 L25 76 L45 60 L45 69 Q70 69 74 54 Z" fill={INK} />
      <circle cx="50" cy="50" r="5" fill={INK} />
    </>
  ),
  soulard: (
    <g transform="rotate(-14 50 56)">
      <path d="M29 39 H67 L65 88 H31 Z" fill={INK} />
      <path d="M67 47 Q86 47 85 63 Q84 78 65 76 V68 Q76 68 76.5 62 Q77 54 67 54 Z" fill={INK} />
      <path d="M26 41 Q25 28 37 30 Q41 19 53 24 Q62 16 69 27 Q76 29 72 41 Z" fill={INK} />
      <path d="M34 53 H62 M33 74 H63" stroke={GLOW} strokeWidth="2.4" />
      <path d="M40 41 Q37 50 41 52 Q45 50 43 41 Z" fill={INK} />
      <circle cx="80" cy="20" r="3.4" fill={INK} />
      <circle cx="88" cy="11" r="2.2" fill={INK} />
    </g>
  ),
  insomniaque: (
    <>
      <path d="M27 11 A15 15 0 1 0 43 33 A12 12 0 1 1 27 11 Z" fill={INK} />
      <path d="M50 19 Q62 33 56 42 Q50 47 44 42 Q38 33 50 19 Z" fill={GLOW} stroke={INK} strokeWidth="2.4" />
      <path d="M50 42 V48" stroke={INK} strokeWidth="2.4" />
      <path d="M41 48 H59 V85 H41 Z" fill={INK} />
      <path d="M41 52 Q38 61 43 61 Q46 55 46 48 Z" fill={INK} />
      <path d="M26 85 H74 L67 93 H33 Z" fill={INK} />
      <circle cx="78" cy="87" r="5.5" fill="none" stroke={INK} strokeWidth="3" />
    </>
  ),
  chasseur: (
    <>
      <path d="M12 83 L92 41 L95 46 L20 91 Z" fill={INK} />
      <path d="M12 83 L3 86 L7 97 L22 93 L20 91 Z" fill={INK} />
      <path d="M13 43 Q50 28 87 43 L81 48 Q50 37 19 48 Z" fill={INK} />
      <path d="M30 42 Q32 17 50 15 Q68 17 70 42 Q50 35 30 42 Z" fill={INK} />
      <path d="M31 37 Q50 31 69 37 L69 40 Q50 34 31 40 Z" fill={GLOW} />
      <path d="M65 25 Q83 5 93 7 Q83 20 70 31 Z" fill={INK} />
    </>
  ),
  tanneur: (
    <>
      <rect x="14" y="14" width="72" height="72" fill="none" stroke={INK} strokeWidth="5" />
      <path d="M32 50 L16 50 M68 50 L84 50 M32 30 L16 16 M68 30 L84 16 M32 70 L16 84 M68 70 L84 84" stroke={INK} strokeWidth="2" />
      <path d="M32 30 Q40 22 46 30 Q50 25 54 30 Q60 22 68 30 Q76 40 69 50 Q76 60 68 70 Q60 78 54 70 Q50 75 46 70 Q40 78 32 70 Q24 60 31 50 Q24 40 32 30 Z" fill={INK} />
    </>
  ),
  macon: (
    <>
      <path d="M13 71 L50 36 L87 71 L79 79 L50 52 L21 79 Z" fill={INK} />
      <path d="M50 9 L57 19 L79 75 L72 78 L50 29 L28 78 L21 75 L43 19 Z" fill={INK} />
      <circle cx="50" cy="13" r="6.5" fill={INK} />
      <circle cx="50" cy="13" r="2.4" fill={GLOW} />
    </>
  ),
  sbire: (
    <>
      <path d="M50 9 Q77 11 79 44 L89 95 L11 95 L21 44 Q23 11 50 9 Z" fill={INK} />
      <path d="M50 27 Q66 29 66 48 Q50 61 34 48 Q34 29 50 27 Z" fill="var(--cavity)" />
      <ellipse cx="44" cy="44" rx="3.4" ry="2.1" fill="var(--eyes)" />
      <ellipse cx="56" cy="44" rx="3.4" ry="2.1" fill="var(--eyes)" />
    </>
  ),
  doppel: (
    <>
      <path d="M6 95 L6 7 L29 7 Q34 18 31 26 L38 34 L33 37 Q36 43 33 47 L37 51 Q30 57 32 64 Q26 75 30 95 Z" fill={INK} />
      <path d="M94 95 L94 7 L71 7 Q66 18 69 26 L62 34 L67 37 Q64 43 67 47 L63 51 Q70 57 68 64 Q74 75 70 95 Z" fill={INK} opacity="0.55" />
    </>
  ),
};

/** La figurine d'un rôle devant son écran éclairé. */
export function RoleArt({ role, className }: { role: Role; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden focusable="false">
      {FIGURES[role]}
    </svg>
  );
}

/** Le dos des cartes : la lune, des étoiles, et la lisière de la forêt découpée. */
export function CardBackArt() {
  return (
    <svg className="back-art" viewBox="0 0 100 140" preserveAspectRatio="xMidYMid slice" aria-hidden focusable="false">
      <circle cx="50" cy="52" r="20" fill="var(--moon)" />
      <circle cx="58" cy="46" r="18" fill="var(--back)" />
      <g fill="var(--moon)" opacity="0.8">
        <circle cx="20" cy="24" r="1.4" />
        <circle cx="80" cy="30" r="1.1" />
        <circle cx="72" cy="80" r="1.3" />
        <circle cx="26" cy="70" r="1" />
        <circle cx="86" cy="58" r="0.9" />
      </g>
      <path d="M0 140 L0 112 L8 98 L14 110 L20 92 L28 108 L34 96 L42 112 L50 100 L58 112 L64 94 L72 108 L80 96 L88 110 L94 100 L100 108 L100 140 Z" fill="var(--back-2)" />
    </svg>
  );
}

/** Le logo : un loup qui hurle devant la pleine lune. */
export function MoonWolf({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden focusable="false">
      <circle cx="50" cy="50" r="46" fill="var(--moon)" />
      <circle cx="36" cy="34" r="6" fill="var(--moon-2)" opacity="0.6" />
      <circle cx="66" cy="62" r="8" fill="var(--moon-2)" opacity="0.5" />
      <path d="M20 100 L26 74 L23 58 L29 45 L31 24 L39 36 L46 35 L58 27 L80 15 L77 23 L68 31 L79 32 L68 37 L62 39 L64 51 L60 62 L64 78 L58 100 Z" fill="var(--shadow)" />
    </svg>
  );
}
