import { Component, type ErrorInfo, type ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="p-8">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="text-ink-2 mt-2 text-sm">The interface hit an unexpected error.</p>
        <button
          type="button"
          onClick={() => this.setState({ failed: false })}
          className="border-line hover:bg-raised mt-4 rounded border px-3 py-1 text-sm"
        >
          Try again
        </button>
      </div>
    );
  }
}
