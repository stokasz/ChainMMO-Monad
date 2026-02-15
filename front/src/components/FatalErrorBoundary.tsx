import React from "react";

type FatalErrorBoundaryProps = {
  children: React.ReactNode;
};

type FatalErrorBoundaryState = {
  error: Error | null;
  componentStack: string | null;
};

function formatErrorForDisplay(error: Error | null, componentStack: string | null): string {
  if (!error) return "Unknown error.";
  const parts = [error.name ? `${error.name}: ${error.message}` : error.message];
  if (import.meta.env.DEV && error.stack) {
    parts.push("", error.stack);
  }
  if (import.meta.env.DEV && componentStack) {
    parts.push("", "React component stack:", componentStack.trim());
  }
  return parts.join("\n");
}

export class FatalErrorBoundary extends React.Component<FatalErrorBoundaryProps, FatalErrorBoundaryState> {
  state: FatalErrorBoundaryState = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<FatalErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Keep a readable stack for users/devs. (React will also log in dev.)
    this.setState({ componentStack: info.componentStack ?? null });
    // eslint-disable-next-line no-console
    console.error("FatalErrorBoundary caught error:", error, info);
  }

  render() {
    const { error, componentStack } = this.state;
    if (!error) {
      return this.props.children;
    }

    const details = formatErrorForDisplay(error, componentStack);

    return (
      <div
        data-testid="fatal-error"
        className="fixed inset-0 z-[1000] flex items-center justify-center bg-bg-base/95 p-4 text-text-primary"
      >
        <div className="w-full max-w-[960px] rounded border border-border-subtle/80 bg-bg-overlay/55 p-4 backdrop-blur">
          <div className="text-t-lg font-semibold text-text-bright">ChainMMO crashed</div>
          <div className="mt-1 text-t-sm text-text-muted">
            A fatal UI error occurred. Reload the page. If this keeps happening, open DevTools and share the error text.
          </div>

          <pre className="mt-3 max-h-[50vh] overflow-auto rounded border border-white/5 bg-black/40 p-3 text-t-xs leading-snug text-text-secondary">
            {details}
          </pre>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary h-8"
              onClick={() => {
                window.location.reload();
              }}
            >
              Reload
            </button>
            <button
              type="button"
              className="btn-secondary h-8"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(details);
                } catch {
                  // Ignore clipboard failures; user can manually copy.
                }
              }}
            >
              Copy Error
            </button>
          </div>
        </div>
      </div>
    );
  }
}
