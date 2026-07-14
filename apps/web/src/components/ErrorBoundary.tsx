import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level error boundary. Without this, any uncaught render error
 * (e.g. a missing route param in `localePath`) tears down the whole
 * app and surfaces as raw "Uncaught Error" in the console. With this,
 * the rest of the tree keeps working and the user sees a real message
 * with a "reload" affordance.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // TODO: surface to telemetry once we have it; console.error keeps the
    // dev-loop fast for now and preserves the React component stack.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          role="alert"
          style={{
            padding: 32,
            maxWidth: 640,
            margin: '10vh auto',
            fontFamily: 'system-ui, sans-serif',
            color: 'var(--text, #e6e6e6)',
            background: 'var(--surface, #15171a)',
            border: '1px solid var(--danger, #ef4444)',
            borderRadius: 8,
          }}
        >
          <h1 style={{ marginTop: 0, fontSize: 18 }}>Algo quebrou na renderização.</h1>
          <p style={{ color: 'var(--text-muted, #9aa0a6)' }}>
            O app capturou um erro e continua rodando — recarregue a página pra voltar ao normal.
          </p>
          <pre
            style={{
              padding: 12,
              background: 'rgba(0,0,0,0.3)',
              borderRadius: 4,
              overflow: 'auto',
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              marginTop: 12,
              padding: '8px 16px',
              background: 'var(--accent, #00e85e)',
              color: '#0a0a0a',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
