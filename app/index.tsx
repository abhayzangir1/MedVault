import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { THEME } from '@/lib/constants';

export default function IndexScreen() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: THEME.colors.bg
        }}
      >
        <ActivityIndicator color={THEME.colors.teal} size="large" />
      </View>
    );
  }

  if (isAuthenticated) return <Redirect href="/(app)/dashboard" />;
  return <Redirect href="/(auth)/login" />;
}
