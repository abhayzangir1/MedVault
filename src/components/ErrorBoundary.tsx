import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { THEME } from '@/lib/constants';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('MedVault runtime error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View style={{
        flex: 1,
        backgroundColor: THEME.colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24
      }}>
        <AlertTriangle color={THEME.colors.amber} size={34} />
        <Text style={{ color: THEME.colors.text, fontSize: 22, fontWeight: '900', marginTop: 14 }}>
          Something went wrong
        </Text>
        <Text style={{ color: THEME.colors.muted, textAlign: 'center', lineHeight: 21, marginTop: 8 }}>
          MedVault caught an unexpected screen error. Your saved health records are not deleted.
        </Text>
        <Pressable
          onPress={() => this.setState({ error: null })}
          style={{
            minHeight: 46,
            borderRadius: 8,
            backgroundColor: THEME.colors.teal,
            paddingHorizontal: 18,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 18
          }}
        >
          <Text style={{ color: THEME.colors.bg, fontWeight: '900' }}>Try Again</Text>
        </Pressable>
      </View>
    );
  }
}
