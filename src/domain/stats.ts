/** Funkcje statystyczne używane w obliczeniach zdarzenia i analizie naciągu. */

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Odchylenie standardowe z próby (dzielnik n − 1); NaN dla n < 2. */
export function sampleStd(xs: readonly number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / (xs.length - 1));
}

export function range(xs: readonly number[]): number {
  if (xs.length === 0) return NaN;
  return Math.max(...xs) - Math.min(...xs);
}

export interface LineFit {
  slope: number;
  intercept: number;
  /** Współczynnik determinacji R². */
  r2: number;
  n: number;
}

/**
 * Dopasowanie prostej y = a·x + b metodą najmniejszych kwadratów, w postaci przyrostowej
 * (bez przechowywania próbek), jak moduł diagnostyczny sterownika. Sumy liczone względem
 * pierwszego punktu, co ogranicza utratę dokładności przy dużych x.
 */
export class IncrementalLineFit {
  private n = 0;
  private x0 = 0;
  private y0 = 0;
  private sx = 0;
  private sy = 0;
  private sxx = 0;
  private sxy = 0;
  private syy = 0;

  add(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (this.n === 0) {
      this.x0 = x;
      this.y0 = y;
    }
    const dx = x - this.x0;
    const dy = y - this.y0;
    this.n++;
    this.sx += dx;
    this.sy += dy;
    this.sxx += dx * dx;
    this.sxy += dx * dy;
    this.syy += dy * dy;
  }

  get count(): number {
    return this.n;
  }

  result(): LineFit | null {
    const n = this.n;
    if (n < 2) return null;
    const den = n * this.sxx - this.sx * this.sx;
    if (Math.abs(den) < 1e-12) return null;
    const slope = (n * this.sxy - this.sx * this.sy) / den;
    const interceptRel = (this.sy - slope * this.sx) / n;
    const intercept = this.y0 + interceptRel - slope * this.x0;
    const ssTot = this.syy - (this.sy * this.sy) / n;
    const ssRes = ssTot - slope * (this.sxy - (this.sx * this.sy) / n);
    const r2 = ssTot > 1e-12 ? 1 - ssRes / ssTot : 1;
    return { slope, intercept, r2, n };
  }

  reset(): void {
    this.n = 0;
    this.sx = this.sy = this.sxx = this.sxy = this.syy = 0;
  }
}

export function fitLine(xs: readonly number[], ys: readonly number[]): LineFit | null {
  const f = new IncrementalLineFit();
  const n = Math.min(xs.length, ys.length);
  for (let i = 0; i < n; i++) f.add(xs[i], ys[i]);
  return f.result();
}
