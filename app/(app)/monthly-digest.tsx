import { useState } from 'react';
import type React from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Sparkles } from 'lucide-react-native';
import {
  DATA_DOMAIN_OPTIONS,
  DataDomain,
  DataScopeSelection,
  DEFAULT_MONTHLY_DIGEST_SCOPE,
  describeDateRange
} from '@/lib/dataScopes';
import { THEME } from '@/lib/constants';
import { queryKeys } from '@/lib/queryKeys';
import { getBillingRegion, getProPriceLabel, isProProfile } from '@/lib/subscription';
import { useAuth } from '@/contexts/AuthContext';
import { dataPacketService } from '@/services/data-packet.service';
import { monthlyDigestService } from '@/services/monthly-digest.service';
import { useProfileStore } from '@/store/useProfileStore';

const digestDomains = DATA_DOMAIN_OPTIONS.filter((domain) => (
  domain.id === 'timeline' ||
  domain.id === 'medications' ||
  domain.id === 'labs' ||
  domain.id === 'symptoms' ||
  domain.id === 'costs'
));

function toggleValue<T extends string>(values: T[], value: T) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function domainLabel(domain: string) {
  return DATA_DOMAIN_OPTIONS.find((option) => option.id === domain)?.label ?? domain;
}

export default function MonthlyDigestScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { profile, careProfiles } = useProfileStore();
  const userId = user?.id ?? '';
  const proEnabled = isProProfile(profile);
  const [scope, setScope] = useState<DataScopeSelection>(() => ({
    ...DEFAULT_MONTHLY_DIGEST_SCOPE,
    domains: [...DEFAULT_MONTHLY_DIGEST_SCOPE.domains],
    careProfileIds: careProfiles.map((careProfile) => careProfile.id)
  }));

  const previewQuery = useQuery({
    queryKey: user ? queryKeys.dataPacketPreview(user.id, `digest-${JSON.stringify(scope)}`) : ['digest-preview', 'anonymous'],
    enabled: !!user,
    queryFn: () => dataPacketService.getPreview(user!.id, careProfiles, scope)
  });

  const digestsQuery = useQuery({
    queryKey: queryKeys.monthlyDigests(userId),
    enabled: !!userId,
    queryFn: () => monthlyDigestService.getDigests(userId)
  });

  const buildMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Sign in again to generate a digest.');
      return monthlyDigestService.buildDigest(user.id, profile, careProfiles, scope);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.monthlyDigests(userId) });
      Alert.alert('Digest ready', 'Monthly Family Digest was generated from your selected packet scope.');
    },
    onError: showError
  });

  const region = profile?.billing_region ?? getBillingRegion(profile?.country);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: THEME.colors.bg }}
      contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 120 }}
    >
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <View style={{
          width: 44,
          height: 44,
          borderRadius: 8,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(168, 85, 247, 0.13)'
        }}>
          <Sparkles color={THEME.colors.purple} size={22} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: THEME.colors.text, fontSize: 28, fontWeight: '900' }}>Monthly Digest</Text>
          <Text style={{ color: THEME.colors.muted, marginTop: 3 }}>A family-care summary from selected records.</Text>
        </View>
      </View>

      <View style={{
        marginTop: 16,
        borderWidth: 1,
        borderColor: proEnabled ? 'rgba(0, 212, 170, 0.35)' : 'rgba(245, 158, 11, 0.5)',
        borderRadius: 8,
        backgroundColor: THEME.colors.surface,
        padding: 14
      }}>
        <Text style={{ color: THEME.colors.text, fontWeight: '900', fontSize: 16 }}>
          {proEnabled ? 'Pro Family Digest' : 'Pro Family feature'}
        </Text>
        <Text style={{ color: THEME.colors.muted, lineHeight: 21, marginTop: 6 }}>
          {proEnabled
            ? 'Digest uses Data Packet Builder scope, so only selected members and domains are included.'
            : `Monthly Digest requires Pro Family at ${getProPriceLabel(region)}.`}
        </Text>
      </View>

      <Section title="Care Profiles">
        <ChipGroup
          items={careProfiles.map((careProfile) => ({ id: careProfile.id, label: careProfile.full_name }))}
          selected={scope.careProfileIds}
          onToggle={(id) => setScope((current) => ({ ...current, careProfileIds: toggleValue(current.careProfileIds, id) }))}
        />
      </Section>

      <Section title="Digest Domains">
        <ChipGroup
          items={digestDomains.map((domain) => ({ id: domain.id, label: domain.label }))}
          selected={scope.domains}
          onToggle={(id) => setScope((current) => ({ ...current, domains: toggleValue(current.domains, id as DataDomain) }))}
        />
      </Section>

      <Section title="Controls">
        <ToggleRow
          title="Critical only"
          subtitle="Focus the digest on abnormal labs, severe symptoms, critical events, refills, and high costs."
          active={!!scope.includeCriticalOnly}
          onPress={() => setScope((current) => ({ ...current, includeCriticalOnly: !current.includeCriticalOnly }))}
        />
        <Text style={{ color: THEME.colors.faint }}>{describeDateRange(scope)}</Text>
      </Section>

      <Section title="Preview">
        <View style={{
          borderWidth: 1,
          borderColor: THEME.colors.border,
          borderRadius: 8,
          backgroundColor: THEME.colors.surface,
          padding: 14
        }}>
          {previewQuery.isLoading ? (
            <ActivityIndicator color={THEME.colors.teal} />
          ) : (
            <>
              <Text style={{ color: THEME.colors.text, fontSize: 16, fontWeight: '900' }}>
                {previewQuery.data?.totalRecords ?? 0} records | {previewQuery.data?.criticalRecords ?? 0} critical
              </Text>
              <View style={{ marginTop: 10, gap: 7 }}>
                {(previewQuery.data?.domains ?? []).map((domain) => (
                  <Text key={domain.domain} style={{ color: THEME.colors.muted }}>
                    {domainLabel(domain.domain)}: {domain.count}
                  </Text>
                ))}
              </View>
            </>
          )}
        </View>
      </Section>

      <Pressable
        disabled={!proEnabled || buildMutation.isPending}
        onPress={() => buildMutation.mutate()}
        style={{
          minHeight: 52,
          borderRadius: 8,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: proEnabled ? THEME.colors.teal : THEME.colors.border,
          flexDirection: 'row',
          gap: 8,
          marginTop: 20
        }}
      >
        {buildMutation.isPending ? <ActivityIndicator color={THEME.colors.bg} /> : <CalendarDays color={THEME.colors.bg} size={18} />}
        <Text style={{ color: THEME.colors.bg, fontWeight: '900', fontSize: 15 }}>Generate Digest</Text>
      </Pressable>

      <Section title="Recent Digests">
        {digestsQuery.isLoading ? (
          <ActivityIndicator color={THEME.colors.teal} />
        ) : (digestsQuery.data ?? []).length === 0 ? (
          <Text style={{ color: THEME.colors.muted }}>No digests generated yet.</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {(digestsQuery.data ?? []).map((digest) => (
              <View key={digest.id} style={{
                borderWidth: 1,
                borderColor: THEME.colors.border,
                borderRadius: 8,
                backgroundColor: THEME.colors.surface,
                padding: 14
              }}>
                <Text style={{ color: THEME.colors.text, fontWeight: '900', fontSize: 16 }}>{digest.title}</Text>
                <Text style={{ color: THEME.colors.faint, marginTop: 4 }}>{new Date(digest.created_at).toLocaleString()}</Text>
                <Text style={{ color: THEME.colors.muted, lineHeight: 21, marginTop: 10 }}>{digest.ai_summary ?? digest.digest_text}</Text>
              </View>
            ))}
          </View>
        )}
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 24, gap: 10 }}>
      <Text style={{ color: THEME.colors.text, fontSize: 18, fontWeight: '900' }}>{title}</Text>
      {children}
    </View>
  );
}

function ChipGroup({ items, selected, onToggle }: {
  items: Array<{ id: string; label: string }>;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {items.map((item) => {
        const active = selected.includes(item.id);
        return (
          <Pressable key={item.id} onPress={() => onToggle(item.id)} style={chipStyle(active)}>
            <Text style={chipTextStyle(active)}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ToggleRow({ title, subtitle, active, onPress }: {
  title: string;
  subtitle: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={{
      borderWidth: 1,
      borderColor: active ? THEME.colors.teal : THEME.colors.border,
      backgroundColor: active ? 'rgba(0, 212, 170, 0.10)' : THEME.colors.surface,
      borderRadius: 8,
      padding: 13,
      flexDirection: 'row',
      gap: 12
    }}>
      <View style={{
        width: 22,
        height: 22,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: active ? THEME.colors.teal : THEME.colors.faint,
        backgroundColor: active ? THEME.colors.teal : 'transparent'
      }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: THEME.colors.text, fontWeight: '900' }}>{title}</Text>
        <Text style={{ color: THEME.colors.faint, marginTop: 3, lineHeight: 19 }}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

function chipStyle(active: boolean) {
  return {
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: active ? THEME.colors.teal : THEME.colors.border,
    backgroundColor: active ? 'rgba(0, 212, 170, 0.10)' : THEME.colors.surface,
    borderRadius: 8
  };
}

function chipTextStyle(active: boolean) {
  return { color: active ? THEME.colors.teal : THEME.colors.muted, fontWeight: '900' as const };
}

function showError(error: Error) {
  Alert.alert('Monthly Digest error', error.message);
}
