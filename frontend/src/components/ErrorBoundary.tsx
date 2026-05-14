import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{ padding: "24px", color: "#ef4444", fontFamily: "monospace", fontSize: "13px", whiteSpace: "pre-wrap" }}>
          <strong>Render error</strong>
          {"\n"}{this.state.error?.message}
          {"\n\n"}<button
            style={{ padding: "6px 12px", cursor: "pointer", border: "1px solid #ef4444", background: "none", color: "#ef4444", borderRadius: "4px" }}
            onClick={() => this.setState({ hasError: false, error: null })}
          >Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}
