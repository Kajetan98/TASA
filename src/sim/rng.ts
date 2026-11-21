/** Generator pseudolosowy z ziarnem (mulberry32), aby przebiegi symulacji były powtarzalne. */
export class Rng {
  private s: number;
  private spare: number | null = null;

  constructor(seed = 1) {
    this.s = seed >>> 0 || 1;
  }

  /** Liczba z przedziału [0, 1). */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Rozkład normalny N(0, sigma²), metoda Boxa–Mullera. */
  gauss(sigma = 1): number {
    if (this.spare !== null) {
      const v = this.spare;
      this.spare = null;
      return v * sigma;
    }
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    const r = Math.sqrt(-2 * Math.log(u));
    this.spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v) * sigma;
  }
}
