import { Component, ErrorInfo, ReactNode } from 'react';
import { Button, GlassPanel, Title } from './UiComponents';

interface ScreenErrorBoundaryProps {
    children: ReactNode;
    onReturnToMenu: () => void;
}

interface ScreenErrorBoundaryState {
    error: Error | null;
}

// Keep render-time configuration/function errors out of the app root. Evaluation still throws so
// failed functions cannot silently turn into valid-looking values or outcomes.
export class ScreenErrorBoundary extends Component<ScreenErrorBoundaryProps, ScreenErrorBoundaryState> {
    state: ScreenErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: unknown): ScreenErrorBoundaryState {
        return { error: error instanceof Error ? error : new Error(String(error)) };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('Failed to render screen:', error, info.componentStack);
    }

    render() {
        const { error } = this.state;
        if (!error) {
            return this.props.children;
        }

        return (
            <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 20, boxSizing: 'border-box', overflowY: 'auto' }}>
                <GlassPanel style={{ maxWidth: 640, width: '100%', padding: 20 }}>
                    <div role="alert">
                        <Title>Unable to display this screen</Title>
                        <p>A function or configuration error prevented this screen from rendering. Return to the menu to open Content Management and fix it, or retry after making changes.</p>
                        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: 'var(--agenda-text-primary)' }}>{error.message}</pre>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                        <Button onClick={() => this.setState({ error: null })}>Retry</Button>
                        <Button variant="secondary" onClick={() => {
                            this.props.onReturnToMenu();
                            this.setState({ error: null });
                        }}>Main Menu</Button>
                    </div>
                </GlassPanel>
            </div>
        );
    }
}
