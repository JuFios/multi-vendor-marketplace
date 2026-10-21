import { Component, type ErrorInfo, type ReactNode } from 'react';

import { ErrorState } from '../components/error-state';

interface State {
  failed: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled render error', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className="mx-auto max-w-lg p-8">
          <ErrorState
            message="Something went wrong."
            onRetry={() => {
              this.setState({ failed: false });
            }}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
