import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

/** Błąd w komponencie pokazuje komunikat z treścią błędu zamiast pustej strony. */
export class ErrorBoundary extends Component<{ children: ReactNode; where: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Błąd w ${this.props.where}:`, error, info.componentStack);
  }

  render() {
    const e = this.state.error;
    if (!e) return this.props.children;
    return (
      <section className="sheet" role="alert" style={{ borderTop: '5px solid var(--crit)' }}>
        <h2>Błąd w {this.props.where}</h2>
        <p>Ten widok przerwał działanie. Połączenia i rejestr prób działają dalej; przełącz panel albo spróbuj ponownie.</p>
        <pre className="console" style={{ maxHeight: 200 }}>{`${e.name}: ${e.message}\n${e.stack ?? ''}`}</pre>
        <button type="button" className="btn" onClick={() => this.setState({ error: null })}>Spróbuj ponownie</button>
      </section>
    );
  }
}
