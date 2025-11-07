import { Component, ErrorInfo, ReactNode } from 'react';
import { logError } from '../utils/logger';

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  message: string | null;
};

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logError('A fatal UI error occurred', { error: error.message, stack: errorInfo.componentStack });
  }

  render() {
    const { hasError, message } = this.state;
    const { children } = this.props;

    if (hasError) {
      return (
        <div className="content-card" role="alert">
          <h2>Something went wrong</h2>
          <p>{message ?? 'An unexpected error occurred.'}</p>
          <p>
            The incident was recorded in the local log store. Review the latest entry under Settings →
            Logs for diagnostics and share it with the team.
          </p>
        </div>
      );
    }

    return children;
  }
}

export default ErrorBoundary;
