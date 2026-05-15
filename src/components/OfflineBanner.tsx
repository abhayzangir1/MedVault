import { useEffect } from 'react';
import { Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { WifiOff } from 'lucide-react-native';
import { THEME } from '@/lib/constants';
import { useUIStore } from '@/store/useUIStore';

export function ConnectivityWatcher() {
  const isOffline = useUIStore((state) => state.isOffline);
  const setIsOffline = useUIStore((state) => state.setIsOffline);

  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      onlineManager.setOnline(online);
      setIsOffline(!online);
    });
  }, [setIsOffline]);

  if (!isOffline) return null;

  return (
    <View style={{
      position: 'absolute',
      left: 12,
      right: 12,
      bottom: 74,
      zIndex: 50,
      minHeight: 44,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: 'rgba(245, 158, 11, 0.45)',
      backgroundColor: '#20170a',
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10
    }}>
      <WifiOff color={THEME.colors.amber} size={18} />
      <Text style={{ color: THEME.colors.text, fontWeight: '800', flex: 1 }}>
        Offline. Existing cached screens may remain visible; new changes need connection.
      </Text>
    </View>
  );
}
