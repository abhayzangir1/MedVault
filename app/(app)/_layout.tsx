import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { Clock3, Files, FlaskConical, Home, Menu, Pill, UserCog } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { THEME } from '@/lib/constants';

export default function ProtectedAppLayout() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.colors.bg }}>
        <ActivityIndicator color={THEME.colors.teal} size="large" />
      </View>
    );
  }

  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          height: 62,
          paddingTop: 7,
          paddingBottom: 8,
          backgroundColor: THEME.colors.surface,
          borderTopColor: THEME.colors.border
        },
        tabBarActiveTintColor: THEME.colors.teal,
        tabBarInactiveTintColor: THEME.colors.faint,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' }
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />
        }}
      />
      <Tabs.Screen
        name="timeline"
        options={{
          title: 'Timeline',
          tabBarIcon: ({ color, size }) => <Clock3 color={color} size={size} />
        }}
      />
      <Tabs.Screen
        name="medications"
        options={{
          title: 'Meds',
          tabBarIcon: ({ color, size }) => <Pill color={color} size={size} />
        }}
      />
      <Tabs.Screen
        name="labs"
        options={{
          title: 'Labs',
          tabBarIcon: ({ color, size }) => <FlaskConical color={color} size={size} />
        }}
      />
      <Tabs.Screen
        name="documents"
        options={{
          title: 'Docs',
          tabBarIcon: ({ color, size }) => <Files color={color} size={size} />
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <Menu color={color} size={size} />
        }}
      />
      <Tabs.Screen
        name="symptoms"
        options={{
          href: null
        }}
      />
      <Tabs.Screen
        name="costs"
        options={{
          href: null
        }}
      />
      <Tabs.Screen
        name="care-profiles"
        options={{
          href: null
        }}
      />
      <Tabs.Screen
        name="data-packet-builder"
        options={{
          href: null
        }}
      />
      <Tabs.Screen
        name="doctor-packet"
        options={{
          href: null
        }}
      />
      <Tabs.Screen
        name="smart-import"
        options={{
          href: null
        }}
      />
      <Tabs.Screen
        name="share-emergency"
        options={{
          href: null
        }}
      />
      <Tabs.Screen
        name="export"
        options={{
          href: null
        }}
      />
      <Tabs.Screen
        name="monthly-digest"
        options={{
          href: null
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <UserCog color={color} size={size} />
        }}
      />
    </Tabs>
  );
}
