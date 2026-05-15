import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ConnectivityWatcher } from '@/components/OfflineBanner';
import { AuthProvider } from '@/contexts/AuthContext';
import { queryClient } from '@/lib/queryClient';
import { notificationService } from '@/services/notification.service';

export default function RootLayout() {
  useEffect(() => {
    notificationService.configure();
    void notificationService.ensureAndroidChannels();
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <StatusBar style="light" backgroundColor="#080d18" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: '#080d18' }
              }}
            />
            <ConnectivityWatcher />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
