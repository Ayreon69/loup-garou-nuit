// Un hasard reproductible (mulberry32) pour les tests et la simulation : rng(n) donne un entier de 0 à n − 1.
export function seeded(seed: number): (n: number) => number {
  let a = seed >>> 0;
  return (n: number) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const x = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(x * n);
  };
}
