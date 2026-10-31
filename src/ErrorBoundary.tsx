import { Component, type ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { err?: string }> {
  state = { err: undefined as string | undefined };
  static getDerivedStateFromError(error: Error) {
    return { err: error.message };
  }
  render() {
    if (this.state.err) {
      return (
        <div className="page card">
          <h2>Something snapped in the undergrowth</h2>
          <p className="muted">{this.state.err}</p>
          <button className="btn btn-gold" onClick={() => location.reload()}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}
