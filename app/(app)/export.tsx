import { useState } from 'react';
import type React from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, FileJson, FileText } from 'lucide-react-native';
import {
  DATA_DOMAIN_OPTIONS,
  DATE_RANGE_OPTIONS,
  DataDomain,
  DataScopeSelection,
  DateRangePreset,
  DEFAULT_EXPORT_SCOPE,
  describeDateRange
} from '@/lib/dataScopes';
import { THEME } from '@/lib/constants';
import { queryKeys } from '@/lib/queryKeys';
import { isProProfile } from '@/lib/subscription';
import { useAuth } from '@/contexts/AuthContext';
import { dataPacketService } from '@/services/data-packet.service';
import { exportService } from '@/services/export.service';
import { useProfileStore } from '@/store/useProfileStore';
import type { ExportBuildResult } from '@/types';

function toggleValue<T extends string>(values: T[], value: T) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function domainLabel(domain: string) {
  return DATA_DOMAIN_OPTIONS.find((option) => option.id === domain)?.label ?? domain;
}

export default function ExportScreen() {
  const { user } = useAuth();
  const { profile, careProfiles, activeCareProfileId } = useProfileStore();
  const [result, setResult] = useState<ExportBuildResult | null>(null);
  const [scope, setScope] = useState<DataScopeSelection>(() => ({
    ...DEFAULT_EXPORT_SCOPE,
    domains: [...DEFAULT_EXPORT_SCOPE.domains],
    careProfileIds: activeCareProfileId ? [activeCareProfileId] : []
  }));

  const previewQuery = useQuery({
    queryKey: user ? queryKeys.dataPacketPreview(user.id, `export-${JSON.stringify(scope)}`) : ['export-preview', 'anonymous'],
    enabled: !!user,
    queryFn: () => dataPacketService.getPreview(user!.id, careProfiles, scope)
  });

  const selectedProfiles = careProfiles.filter((careProfile) => scope.careProfileIds.includes(careProfile.id));
  const includesFamily = selectedProfiles.some((careProfile) => careProfile.kind === 'family') || selectedProfiles.length > 1;
  const proEnabled = isProProfile(profile);
  const blockedReason = !proEnabled && includesFamily
    ? 'Family bundle export requires Pro Family. Basic self export remains free.'
    : !proEnabled && scope.includeAttachments
      ? 'Attachment export requires Pro Family.'
      : null;

  const buildMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Sign in again to export.');
      return exportService.buildExport(user.id, profile, careProfiles, { ...scope, purpose: 'export' });
    },
    onSuccess: (nextResult) => {
      setResult(nextResult);
      Alert.alert('Export ready', `Created PDF and JSON bundle with ${nextResult.recordCount} selected records.`);
    },
    onError: showError
  });

  const sharePdfMutation = useMutation({
    mutationFn: async () => {
      if (!result) throw new Error('Generate an export first.');
      await exportService.shareFile(result.pdfUri, 'application/pdf', 'Share MedVault Export PDF');
    },
    onError: showError
  });

  const shareJsonMutation = useMutation({
    mutationFn: async () => {
      if (!result) throw new Error('Generate an export first.');
      await exportService.shareFile(result.jsonUri, 'application/json', 'Share MedVault Export JSON');
    },
    onError: showError
  });

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
          <Download color={THEME.colors.teal} size={22} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: THEME.colors.text, fontSize: 28, fontWeight: '900' }}>Export</Text>
          <Text style={{ color: THEME.colors.muted, marginTop: 3 }}>Create a PDF plus JSON bundle from selected data only.</Text>
        </View>
      </View>

      <View style={{
        marginTop: 16,
        borderWidth: 1,
        borderColor: blockedReason ? 'rgba(245, 158, 11, 0.5)' : 'rgba(0, 212, 170, 0.35)',
        borderRadius: 8,
        backgroundColor: THEME.colors.surface,
        padding: 14
      }}>
        <Text style={{ color: THEME.colors.text, fontWeight: '900', fontSize: 16 }}>
          {proEnabled ? 'Advanced export enabled' : 'Basic export is free'}
        </Text>
        <Text style={{ color: THEME.colors.muted, lineHeight: 21, marginTop: 6 }}>
          Export uses the same Data Packet Builder controls as Doctor Packet and Emergency ID. Nothing outside this selection is included.
        </Text>
        {blockedReason && <Text style={{ color: THEME.colors.amber, fontWeight: '900', marginTop: 8 }}>{blockedReason}</Text>}
      </View>

      <Section title="Care Profiles">
        <ChipGroup
          items={careProfiles.map((careProfile) => ({ id: careProfile.id, label: careProfile.full_name }))}
          selected={scope.careProfileIds}
          onToggle={(id) => setScope((current) => ({ ...current, careProfileIds: toggleValue(current.careProfileIds, id) }))}
        />
      </Section>

      <Section title="Data Domains">
        <ChipGroup
          items={DATA_DOMAIN_OPTIONS.map((domain) => ({ id: domain.id, label: domain.label }))}
          selected={scope.domains}
          onToggle={(id) => setScope((current) => ({ ...current, domains: toggleValue(current.domains, id as DataDomain) }))}
        />
      </Section>

      <Section title="Date Range">
        <ChipGroup
          items={DATE_RANGE_OPTIONS.map((range) => ({ id: range.id, label: range.label }))}
          selected={[scope.dateRange]}
          single
          onToggle={(id) => setScope((current) => ({ ...current, dateRange: id as DateRangePreset }))}
        />
        {scope.dateRange === 'custom' && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
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
        <Text style={{ color: THEME.colors.faint }}>{describeDateRange(scope)}</Text>
      </Section>

      <Section title="Controls">
        <ToggleRow
          title="Critical only"
          subtitle="Export only urgent events, abnormal labs, severe symptoms, reminder/refill meds, and high costs."
          active={!!scope.includeCriticalOnly}
          onPress={() => setScope((current) => ({ ...current, includeCriticalOnly: !current.includeCriticalOnly }))}
        />
        <ToggleRow
          title="Include attachments"
          subtitle="Pro Family only. Basic export includes selected metadata and summaries."
          active={!!scope.includeAttachments}
          onPress={() => setScope((current) => ({ ...current, includeAttachments: !current.includeAttachments }))}
        />
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
              <Text style={{ color: THEME.colors.text, fontWeight: '900', fontSize: 16 }}>
                {previewQuery.data?.totalRecords ?? 0} selected records | {previewQuery.data?.totalAttachments ?? 0} files
              </Text>
              <View style={{ marginTop: 10, gap: 7 }}>
                {(previewQuery.data?.domains ?? []).map((domain) => (
                  <Text key={domain.domain} style={{ color: THEME.colors.muted }}>
                    {domainLabel(domain.domain)}: {domain.count}
                  </Text>
                ))}
              </View>
              {!!previewQuery.data?.warnings.length && (
                <View style={{ marginTop: 10, gap: 5 }}>
                  {previewQuery.data.warnings.map((warning) => (
                    <Text key={warning} style={{ color: THEME.colors.amber, lineHeight: 20 }}>{warning}</Text>
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      </Section>

      <Pressable
        disabled={buildMutation.isPending || !!blockedReason}
        onPress={() => buildMutation.mutate()}
        style={{
          minHeight: 52,
          borderRadius: 8,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: blockedReason ? THEME.colors.border : THEME.colors.teal,
          flexDirection: 'row',
          gap: 8,
          marginTop: 20
        }}
      >
        {buildMutation.isPending ? <ActivityIndicator color={THEME.colors.bg} /> : <Download color={THEME.colors.bg} size={18} />}
        <Text style={{ color: THEME.colors.bg, fontWeight: '900', fontSize: 15 }}>Generate Export</Text>
      </Pressable>

      {result && (
        <View style={{ marginTop: 14, gap: 10 }}>
          <Text style={{ color: THEME.colors.green, fontWeight: '900' }}>
            Export ready: {result.recordCount} records in `{result.fileBaseName}`
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={() => sharePdfMutation.mutate()} style={[secondaryButtonStyle, { flex: 1 }]}>
              <FileText color={THEME.colors.teal} size={17} />
              <Text style={{ color: THEME.colors.teal, fontWeight: '900' }}>Share PDF</Text>
            </Pressable>
            <Pressable onPress={() => shareJsonMutation.mutate()} style={[secondaryButtonStyle, { flex: 1 }]}>
              <FileJson color={THEME.colors.teal} size={17} />
              <Text style={{ color: THEME.colors.teal, fontWeight: '900' }}>Share JSON</Text>
            </Pressable>
          </View>
        </View>
      )}
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
  single?: boolean;
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

const inputStyle = {
  minHeight: 48,
  borderWidth: 1,
  borderColor: THEME.colors.border,
  borderRadius: 8,
  paddingHorizontal: 12,
  color: THEME.colors.text,
  backgroundColor: THEME.colors.elevated
};

const secondaryButtonStyle = {
  minHeight: 46,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: THEME.colors.border,
  backgroundColor: THEME.colors.elevated,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  flexDirection: 'row' as const,
  gap: 8
};

function showError(error: Error) {
  Alert.alert('Export error', error.message);
}
