import { Pressable, Text, View } from 'react-native';
import { Crown } from 'lucide-react-native';
import { getProPriceLabel } from '@/lib/subscription';
import { THEME } from '@/lib/constants';
import type { BillingRegion } from '@/types';

interface UpgradeBannerProps {
  region: BillingRegion;
  title?: string;
  message: string;
  onUpgrade?: () => void;
  disabled?: boolean;
}

export function UpgradeBanner({
  region,
  title = 'Upgrade to Pro Family',
  message,
  onUpgrade,
  disabled
}: UpgradeBannerProps) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.35)',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        borderRadius: 8,
        padding: 14
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Crown color={THEME.colors.amber} size={20} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: THEME.colors.text, fontSize: 15, fontWeight: '800' }}>{title}</Text>
          <Text style={{ color: THEME.colors.amber, fontSize: 13, fontWeight: '800', marginTop: 2 }}>
            {getProPriceLabel(region)}
          </Text>
        </View>
      </View>
      <Text style={{ color: THEME.colors.muted, fontSize: 13, lineHeight: 20, marginTop: 10 }}>
        {message}
      </Text>
      {onUpgrade ? (
        <Pressable
          disabled={disabled}
          onPress={onUpgrade}
          style={{
            height: 44,
            borderRadius: 8,
            backgroundColor: THEME.colors.amber,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 12,
            opacity: disabled ? 0.65 : 1
          }}
        >
          <Text style={{ color: THEME.colors.bg, fontSize: 14, fontWeight: '900' }}>Review Google Play Plan</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
