import { Component } from 'react';
import type { ReactNode } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@databricks/appkit-ui/react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch() {
    console.error('Genie Cost Observatory failed to render.');
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background p-4">
          <Card className="mx-auto mt-8 max-w-xl">
            <CardHeader>
              <CardTitle>Dashboard unavailable</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                The dashboard could not render. No credentials or technical details are shown in the application.
              </p>
              <Button onClick={() => window.location.reload()}>Reload dashboard</Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
