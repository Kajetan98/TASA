/**
 * Składa linie tekstowe z fragmentów. Transporty strumieniowe (port szeregowy, powiadomienia BLE)
 * dzielą linie w dowolnych miejscach, a jeden fragment może zawierać kilka linii.
 */
export class LineSplitter {
  private buf = '';
  private overflowCount = 0;

  constructor(private readonly maxLineLength = 8192) {}

  /** Dodaje fragment i zwraca kompletne, niepuste linie (bez znaków \r i \n). */
  push(chunk: string): string[] {
    this.buf += chunk;
    const out: string[] = [];
    let idx = this.buf.indexOf('\n');
    while (idx >= 0) {
      const line = this.buf.slice(0, idx).replace(/\r$/, '');
      this.buf = this.buf.slice(idx + 1);
      if (line.trim().length > 0) out.push(line);
      idx = this.buf.indexOf('\n');
    }
    if (this.buf.length > this.maxLineLength) {
      // Linia bez zakończenia dłuższa niż limit: odrzucenie, aby bufor nie rósł bez końca.
      this.buf = '';
      this.overflowCount++;
    }
    return out;
  }

  get overflows(): number {
    return this.overflowCount;
  }

  reset(): void {
    this.buf = '';
  }
}
