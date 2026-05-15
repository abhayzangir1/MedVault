import { useMemo, useState } from 'react';
import type React from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FileArchive, ShieldCheck } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import {
  DATA_DOMAIN_OPTIONS,
  DATA_PURPOSE_OPTIONS,
  DATE_RANGE_OPTIONS,
  DataDomain,
  DataPurpose,
  DataScopeSelection,
  DateRangePreset,
  describeDateRange,
  getDefaultScopeForPurpose
} from '@/lib/dataScopes';
import { queryKeys } from '@/lib/queryKeys';
import { THEME } from '@/lib/constants';
import { dataPacketService } from '@/services/data-packet.service';
import { useProfileStore } from '@/store/useProfileStore';

function toggleValue<T extends string>(values: T[], value: T) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function domainLabel(domain: string) {
  return DATA_DOMAIN_OPTIONS.find((option) => option.id === domain)?.label ?? domain;
}

export default function DataPacketBuilderScreen() {
  const { user } = useAuth();
  const { careProfiles, activeCareProfileId } = useProfileStore();
  const [scope, setScope] = useState<DataScopeSelection>(() => ({
    ...getDefaultScopeForPurpose('doctor_packet'),
    careProfileIds: activeCareProfileId ? [activeCareProfileId] : []
  }));

  const previewQuery = useQuery({
    queryKey: user ? queryKeys.dataPacketPreview(user.id, JSON.stringify(scope)) : ['data-packet-preview', 'anonymous'],
    enabled: !!user,
    queryFn: () => dataPacketService.getPreview(user!.id, careProfiles, scope)
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Sign in again to create a packet.');
      if (scope.careProfileIds.length === 0) throw new Error('Choose at least one care profile.');
      if (scope.domains.length === 0) throw new Error('Choose at least one data domain.');
      return dataPacketService.saveDraft(user.id, scope);
    },
    onSuccess: (packet) => {
      Alert.alert('Packet scope saved', `Saved ${packet.purpose.replace('_', ' ')} scope. Future Doctor Packet, Share Link, Export, Emergency ID, and AI features can reuse this selection.`);
    },
    onError: (error) => {
      Alert.alert('Packet not saved', error instanceof Error ? error.message : 'Please try again.');
    }
  });

  const selectedPurpose = useMemo(
    () => DATA_PURPOSE_OPTIONS.find((option) => option.id === scope.purpose),
    [scope.purpose]
  );
  const preview = previewQuery.data;

  const changePurpose = (purpose: DataPurpose) => {
    setScope((current) => ({
      ...getDefaultScopeForPurpose(purpose),
      careProfileIds: current.careProfileIds,
      customStartDate: current.customStartDate,
      customEndDate: current.customEndDate
    }));
  };

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
          backgroundColor: 'rgba(0, 212, 170, 0.12)'
        }}>
          <FileArchive color={THEME.colors.teal} size={22} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: THEME.colors.text, fontSize: 28, fontWeight: '900' }}>Data Packet Builder</Text>
          <Text style={{ color: THEME.colors.muted, marginTop: 3 }}>Choose exactly what can be used, shared, analyzed, or exported.</Text>
        </View>
      </View>

      <View style={{
        marginTop: 16,
        borderWidth: 1,
        borderColor: 'rgba(0, 212, 170, 0.35)',
        borderRadius: 8,
        backgroundColor: THEME.colors.surface,
        padding: 14,
        flexDirection: 'row',
        gap: 10
      }}>
        <ShieldCheck color={THEME.colors.teal} size={20} />
        <Text style={{ color: THEME.colors.muted, flex: 1, lineHeight: 21 }}>
          Defaults stay minimal. MedVault never sends every record to AI, Emergency ID, Export, or a doctor link unless you explicitly select it here.
        </Text>
      </View>

      <Section title="Purpose">
        <View style={{ gap: 10 }}>
          {DATA_PURPOSE_OPTIONS.map((option) => {
            const active = scope.purpose === option.id;
            return (
              <Pressable
                key={option.id}
                onPress={() => changePurpose(option.id)}
                style={{
                  borderWidth: 1,
                  borderColor: active ? THEME.colors.teal : THEME.colors.border,
                  backgroundColor: active ? 'rgba(0, 212, 170, 0.10)' : THEME.colors.surface,
                  borderRadius: 8,
                  padding: 13
                }}
              >
                <Text style={{ color: THEME.colors.text, fontWeight: '900' }}>{option.label}</Text>
                <Text style={{ color: THEME.colors.faint, marginTop: 4, lineHeight: 19 }}>{option.note}</Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title="Care Profiles">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {careProfiles.map((careProfile) => {
            const selected = scope.careProfileIds.includes(careProfile.id);
            return (
              <Pressable
                key={careProfile.id}
                onPress={() => setScope((current) => ({
                  ...current,
                  careProfileIds: toggleValue(current.careProfileIds, careProfile.id)
                }))}
                style={{
                  paddingVertical: 9,
                  paddingHorizontal: 11,
                  borderWidth: 1,
                  borderColor: selected ? THEME.colors.teal : THEME.colors.border,
                  backgroundColor: selected ? 'rgba(0, 212, 170, 0.10)' : THEME.colors.surface,
                  borderRadius: 8
                }}
              >
                <Text style={{ color: selected ? THEME.colors.teal : THEME.colors.muted, fontWeight: '900' }}>
                  {careProfile.full_name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title="Data Domains">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {DATA_DOMAIN_OPTIONS.map((domain) => {
            const selected = scope.domains.includes(domain.id);
            return (
              <Pressable
                key={domain.id}
                onPress={() => setScope((current) => ({
                  ...current,
                  domains: toggleValue(current.domains, domain.id as DataDomain)
                }))}
                style={{
                  paddingVertical: 9,
                  paddingHorizontal: 11,
                  borderWidth: 1,
                  borderColor: selected ? THEME.colors.teal : THEME.colors.border,
                  backgroundColor: selected ? 'rgba(0, 212, 170, 0.10)' : THEME.colors.surface,
                  borderRadius: 8
                }}
              >
                <Text style={{ color: selected ? THEME.colors.teal : THEME.colors.muted, fontWeight: '900' }}>
                  {domain.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title="Date Range">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {DATE_RANGE_OPTIONS.map((range) => {
            const selected = scope.dateRange === range.id;
            return (
              <Pressable
                key={range.id}
                onPress={() => setScope((current) => ({ ...current, dateRange: range.id as DateRangePreset }))}
                style={{
                  paddingVertical: 9,
                  paddingHorizontal: 11,
                  borderWidth: 1,
                  borderColor: selected ? THEME.colors.teal : THEME.colors.border,
                  backgroundColor: selected ? 'rgba(0, 212, 170, 0.10)' : THEME.colors.surface,
                  borderRadius: 8
                }}
              >
                <Text style={{ color: selected ? THEME.colors.teal : THEME.colors.muted, fontWeight: '900' }}>
                  {range.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {scope.dateRange === 'custom' && (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <TextInput
              placeholder="Start YYYY-MM-DD"
              placeholderTextColor={THEME.colors.faint}
              value={scope.customStartDate ?? ''}
              onChangeText={(customStartDate) => setScope((current) => ({ ...current, customStartDate }))}
              style={[inputStyle, { flex: 1 }]}
            />
            <TextInput
              placeholder="End YYYY-MM-DD"
              placeholderTextColor={THEME.colors.faint}
              value={scope.customEndDate ?? ''}
              onChangeText={(customEndDate) => setScope((current) => ({ ...current, customEndDate }))}
              style={[inputStyle, { flex: 1 }]}
            />
          </View>
        )}
      </Section>

      <Section title="Controls">
        <View style={{ gap: 10 }}>
          <ToggleRow
            title="Critical only"
            subtitle="Include only critical timeline events, abnormal labs, severe symptoms, urgent meds, and high costs."
            active={!!scope.includeCriticalOnly}
            onPress={() => setScope((current) => ({ ...current, includeCriticalOnly: !current.includeCriticalOnly }))}
          />
          <ToggleRow
            title="Include attachments"
            subtitle="Allow original files and uploaded images to be counted for packet generation."
            active={!!scope.includeAttachments}
            onPress={() => setScope((current) => ({ ...current, includeAttachments: !current.includeAttachments }))}
          />
          {(scope.purpose === 'doctor_packet' || scope.purpose === 'ai_analysis') && (
            <TextInput
              placeholder="Reason for visit or analysis goal"
              placeholderTextColor={THEME.colors.faint}
              value={scope.reasonForVisit ?? ''}
              onChangeText={(reasonForVisit) => setScope((current) => ({ ...current, reasonForVisit }))}
              style={inputStyle}
            />
          )}
          {scope.purpose === 'share_link' && (
            <TextInput
              placeholder="Expiry YYYY-MM-DD"
              placeholderTextColor={THEME.colors.faint}
              value={scope.expiresAt ?? ''}
              onChangeText={(expiresAt) => setScope((current) => ({ ...current, expiresAt }))}
              style={inputStyle}
            />
          )}
        </View>
      </Section>

      <Section title="Preview">
        <View style={{
          borderWidth: 1,
          borderColor: THEME.colors.border,
          borderRadius: 8,
          backgroundColor: THEME.colors.surface,
          padding: 14
        }}>
          <Text style={{ color: THEME.colors.text, fontWeight: '900', fontSize: 16 }}>
            {selectedPurpose?.label ?? 'Packet'} | {describeDateRange(scope)}
          </Text>
          {previewQuery.isLoading ? (
            <ActivityIndicator color={THEME.colors.teal} style={{ marginTop: 16 }} />
          ) : (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
                {[
                  ['Profiles', preview?.careProfileCount ?? 0],
                  ['Records', preview?.totalRecords ?? 0],
                  ['Critical', preview?.criticalRecords ?? 0],
                  ['Attachments', preview?.totalAttachments ?? 0]
                ].map(([label, value]) => (
                  <View key={label} style={{
                    flex: 1,
                    minWidth: 115,
                    borderRadius: 8,
                    backgroundColor: THEME.colors.elevated,
                    padding: 10
                  }}>
                    <Text style={{ color: THEME.colors.faint, fontSize: 11, fontWeight: '800' }}>{label}</Text>
                    <Text style={{ color: THEME.colors.text, fontSize: 20, fontWeight: '900', marginTop: 4 }}>{value}</Text>
                  </View>
                ))}
              </View>

              <View style={{ marginTop: 12, gap: 8 }}>
                {preview?.domains.map((domain) => (
                  <View key={domain.domain} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ color: THEME.colors.text, flex: 1, fontWeight: '800' }}>{domainLabel(domain.domain)}</Text>
                    <Text style={{ color: THEME.colors.muted }}>{domain.count} records</Text>
                    {domain.attachmentCount > 0 && <Text style={{ color: THEME.colors.teal }}>{domain.attachmentCount} files</Text>}
                  </View>
                ))}
              </View>

              {!!preview?.warnings.length && (
                <View style={{ marginTop: 12, gap: 5 }}>
                  {preview.warnings.map((warning) => (
                    <Text key={warning} style={{ color: THEME.colors.amber, lineHeight: 20 }}>{warning}</Text>
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      </Section>

      <Pressable
        disabled={saveMutation.isPending}
        onPress={() => saveMutation.mutate()}
        style={{
          minHeight: 52,
          borderRadius: 8,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: THEME.colors.teal,
          marginTop: 18
        }}
      >
        {saveMutation.isPending ? (
          <ActivityIndicator color={THEME.colors.bg} />
        ) : (
          <Text style={{ color: THEME.colors.bg, fontSize: 16, fontWeight: '900' }}>Save Packet Scope</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 24 }}>
      <Text style={{ color: THEME.colors.text, fontSize: 18, fontWeight: '900', marginBottom: 10 }}>{title}</Text>
      {children}
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
    <Pressable
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: active ? THEME.colors.teal : THEME.colors.border,
        backgroundColor: active ? 'rgba(0, 212, 170, 0.10)' : THEME.colors.surface,
        borderRadius: 8,
        padding: 13,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12
      }}
    >
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
        <Text style={{ color: THEME.colors.faint, lineHeight: 19, marginTop: 3 }}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

const inputStyle = {
  minHeight: 48,
  borderWidth: 1,
  borderColor: THEME.colors.border,
  borderRadius: 8,
  paddingHorizontal: 12,
  color: THEME.colors.text,
  backgroundColor: THEME.colors.elevated
};
