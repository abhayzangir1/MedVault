import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import type React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react-native';
import { THEME } from '@/lib/constants';
import { queryKeys } from '@/lib/queryKeys';
import { sharingService } from '@/services/sharing.service';

function valueText(value: unknown) {
  if (value == null || value === '') return 'Not recorded';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'None recorded';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function PublicResponderPage() {
  const params = useLocalSearchParams<{ token: string }>();
  const token = params.token ?? '';
  const packetQuery = useQuery({
    queryKey: queryKeys.publicHealthPacket(token),
    enabled: !!token,
    queryFn: () => sharingService.getPublicHealthPacket(token)
  });

  if (packetQuery.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.colors.bg }}>
        <ActivityIndicator color={THEME.colors.teal} size="large" />
        <Text style={{ color: THEME.colors.muted, marginTop: 12 }}>Loading responder packet...</Text>
      </View>
    );
  }

  if (packetQuery.isError || !packetQuery.data?.ok) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.colors.bg, padding: 24 }}>
        <ShieldAlert color={THEME.colors.red} size={30} />
        <Text style={{ color: THEME.colors.text, fontSize: 20, fontWeight: '900', marginTop: 12 }}>Packet unavailable</Text>
        <Text style={{ color: THEME.colors.muted, textAlign: 'center', lineHeight: 21, marginTop: 8 }}>
          {packetQuery.data?.error ?? 'This link may be expired, revoked, or unavailable.'}
        </Text>
      </View>
    );
  }

  const packet = packetQuery.data;
  const records = packet.records ?? {};

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: THEME.colors.bg }}
      contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 80 }}
    >
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <View style={{
          width: 44,
          height: 44,
          borderRadius: 8,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(239, 68, 68, 0.13)'
        }}>
          <ShieldAlert color={packet.token_type === 'emergency_id' ? THEME.colors.red : THEME.colors.teal} size={23} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: THEME.colors.text, fontSize: 26, fontWeight: '900' }}>
            {packet.token_type === 'emergency_id' ? 'Emergency ID' : 'Shared Health Packet'}
          </Text>
          <Text style={{ color: THEME.colors.muted, marginTop: 4 }}>
            Selected data only. Not a diagnosis.
          </Text>
        </View>
      </View>

      {packet.expires_at && (
        <Text style={{ color: THEME.colors.amber, marginTop: 16, fontWeight: '800' }}>
          Expires {new Date(packet.expires_at).toLocaleString()}
        </Text>
      )}

      <Section title="Care Profiles">
        {(packet.care_profiles ?? []).map((profile) => (
          <View key={profile.id} style={cardStyle}>
            <Text style={{ color: THEME.colors.text, fontSize: 18, fontWeight: '900' }}>{profile.full_name}</Text>
            <Text style={mutedLine}>Relationship: {profile.relationship}</Text>
            <Text style={mutedLine}>Blood type: {profile.blood_type ?? 'Unknown'}</Text>
            <Text style={mutedLine}>Allergies: {valueText(profile.allergies)}</Text>
            <Text style={mutedLine}>Conditions: {valueText(profile.chronic_conditions)}</Text>
            <Text style={mutedLine}>
              Emergency contact: {profile.emergency_contact_name ?? 'Not recorded'} {profile.emergency_contact_phone ?? ''}
            </Text>
          </View>
        ))}
      </Section>

      {Object.entries(records).map(([domain, items]) => (
        <Section key={domain} title={domain.replace('_', ' ')}>
          {items.length === 0 ? (
            <Text style={{ color: THEME.colors.muted }}>No selected records.</Text>
          ) : (
            items.map((item, index) => (
              <View key={`${domain}-${index}`} style={cardStyle}>
                {Object.entries(item).filter(([key]) => key !== 'care_profile_id').slice(0, 8).map(([key, value]) => (
                  <Text key={key} style={mutedLine}>
                    <Text style={{ color: THEME.colors.text, fontWeight: '800' }}>{key.replaceAll('_', ' ')}: </Text>
                    {valueText(value)}
                  </Text>
                ))}
              </View>
            ))
          )}
        </Section>
      ))}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 24, gap: 10 }}>
      <Text style={{ color: THEME.colors.text, fontSize: 18, fontWeight: '900', textTransform: 'capitalize' }}>{title}</Text>
      {children}
    </View>
  );
}

const cardStyle = {
  borderWidth: 1,
  borderColor: THEME.colors.border,
  borderRadius: 8,
  backgroundColor: THEME.colors.surface,
  padding: 14
};

const mutedLine = {
  color: THEME.colors.muted,
  lineHeight: 21,
  marginTop: 5
};
