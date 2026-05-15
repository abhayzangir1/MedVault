import { useMemo, useState } from 'react';
import type React from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Share2, Stethoscope } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import {
  DATA_DOMAIN_OPTIONS,
  DATE_RANGE_OPTIONS,
  DataDomain,
  DataScopeSelection,
  DateRangePreset,
  DEFAULT_DOCTOR_PACKET_SCOPE,
  describeDateRange
} from '@/lib/dataScopes';
import { queryKeys } from '@/lib/queryKeys';
import { canCreateDoctorPacket, isProProfile } from '@/lib/subscription';
import { THEME } from '@/lib/constants';
import { dataPacketService } from '@/services/data-packet.service';
import { doctorPacketService } from '@/services/doctor-packet.service';
import { useProfileStore } from '@/store/useProfileStore';

const doctorDomains = DATA_DOMAIN_OPTIONS.filter((domain) => (
  domain.id === 'profile' ||
  domain.id === 'timeline' ||
  domain.id === 'medications' ||
  domain.id === 'labs' ||
  domain.id === 'documents' ||
  domain.id === 'symptoms' ||
  domain.id === 'costs'
));

function toggleValue<T extends string>(values: T[], value: T) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function domainLabel(domain: string) {
  return DATA_DOMAIN_OPTIONS.find((option) => option.id === domain)?.label ?? domain;
}

export default function DoctorPacketScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { profile, careProfiles, activeCareProfileId } = useProfileStore();
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const [scope, setScope] = useState<DataScopeSelection>(() => ({
    ...DEFAULT_DOCTOR_PACKET_SCOPE,
    careProfileIds: activeCareProfileId ? [activeCareProfileId] : []
  }));

  const packetsCountQuery = useQuery({
    queryKey: user ? ['doctor-packets-count', user.id] : ['doctor-packets-count', 'anonymous'],
    enabled: !!user,
    queryFn: () => doctorPacketService.countDoctorPacketsThisMonth(user!.id)
  });

  const previewQuery = useQuery({
    queryKey: user ? queryKeys.dataPacketPreview(user.id, `doctor-${JSON.stringify(scope)}`) : ['data-packet-preview', 'doctor-anonymous'],
    enabled: !!user,
    queryFn: () => dataPacketService.getPreview(user!.id, careProfiles, scope)
  });

  const selectedCareProfiles = useMemo(
    () => careProfiles.filter((careProfile) => scope.careProfileIds.includes(careProfile.id)),
    [careProfiles, scope.careProfileIds]
  );
  const includesFamily = selectedCareProfiles.some((careProfile) => careProfile.kind === 'family') || selectedCareProfiles.length > 1;
  const gate = canCreateDoctorPacket(profile, packetsCountQuery.data ?? 0, includesFamily);
  const proEnabled = isProProfile(profile);
  const canBuild = !!profile && gate.allowed && (!scope.includeAttachments || proEnabled);

  const buildMutation = useMutation({
    mutationFn: async () => {
      if (!user || !profile) throw new Error('Sign in again to build a Doctor Packet.');
      return doctorPacketService.buildDoctorPacket(
        user.id,
        profile,
        careProfiles,
        { ...scope, purpose: 'doctor_packet' },
        packetsCountQuery.data ?? 0
      );
    },
    onSuccess: async (result) => {
      setPdfUri(result.pdfUri);
      queryClient.invalidateQueries({ queryKey: ['doctor-packets-count', user?.id] });
      Alert.alert('Doctor Packet ready', 'The PDF was generated with only your selected data.');
    },
    onError: (error) => {
      Alert.alert('Doctor Packet failed', error instanceof Error ? error.message : 'Please try again.');
    }
  });

  const shareMutation = useMutation({
    mutationFn: async () => {
      if (!pdfUri) throw new Error('Generate a Doctor Packet first.');
      await doctorPacketService.sharePdf(pdfUri);
    },
    onError: (error) => {
      Alert.alert('Share failed', error instanceof Error ? error.message : 'Please try again.');
    }
  });

  const preview = previewQuery.data;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: THEME.colors.bg }}
      contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 120 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{
          width: 44,
          height: 44,
          borderRadius: 8,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 212, 170, 0.12)'
        }}>
          <Stethoscope color={THEME.colors.teal} size={22} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: THEME.colors.text, fontSize: 28, fontWeight: '900' }}>Doctor Packet</Text>
          <Text style={{ color: THEME.colors.muted, marginTop: 3 }}>Build a clean visit summary from selected records only.</Text>
        </View>
      </View>

      <View style={{
        marginTop: 16,
        borderWidth: 1,
        borderColor: proEnabled ? 'rgba(0, 212, 170, 0.45)' : THEME.colors.border,
        borderRadius: 8,
        backgroundColor: THEME.colors.surface,
        padding: 14
      }}>
        <Text style={{ color: THEME.colors.text, fontWeight: '900', fontSize: 16 }}>
          {proEnabled ? 'Pro Family Doctor Packets' : 'Free Doctor Packet'}
        </Text>
        <Text style={{ color: THEME.colors.muted, lineHeight: 21, marginTop: 6 }}>
          {proEnabled
            ? 'Family packets, attachments, and broader visit summaries are enabled.'
            : 'Free includes one basic self Doctor Packet each month. Family packets and attachments require Pro Family.'}
        </Text>
        {!gate.allowed && <Text style={{ color: THEME.colors.amber, marginTop: 8, fontWeight: '800' }}>{gate.reason}</Text>}
        {scope.includeAttachments && !proEnabled && (
          <Text style={{ color: THEME.colors.amber, marginTop: 8, fontWeight: '800' }}>Attachments require Pro Family.</Text>
        )}
      </View>

      <Section title="Visit Reason">
        <TextInput
          placeholder="Example: Diabetes follow-up, fever review, post-surgery visit"
          placeholderTextColor={THEME.colors.faint}
          value={scope.reasonForVisit ?? ''}
          onChangeText={(reasonForVisit) => setScope((current) => ({ ...current, reasonForVisit }))}
          style={inputStyle}
        />
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
                style={chipStyle(selected)}
              >
                <Text style={chipTextStyle(selected)}>{careProfile.full_name}</Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title="Records">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {doctorDomains.map((domain) => {
            const selected = scope.domains.includes(domain.id);
            return (
              <Pressable
                key={domain.id}
                onPress={() => setScope((current) => ({
                  ...current,
                  domains: toggleValue(current.domains, domain.id as DataDomain)
                }))}
                style={chipStyle(selected)}
              >
                <Text style={chipTextStyle(selected)}>{domain.label}</Text>
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
                style={chipStyle(selected)}
              >
                <Text style={chipTextStyle(selected)}>{range.label}</Text>
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

      <Section title="Packet Options">
        <View style={{ gap: 10 }}>
          <ToggleRow
            title="Critical only"
            subtitle="Focus packet on urgent events, abnormal labs, severe symptoms, active reminder meds, and high costs."
            active={!!scope.includeCriticalOnly}
            onPress={() => setScope((current) => ({ ...current, includeCriticalOnly: !current.includeCriticalOnly }))}
          />
          <ToggleRow
            title="Include attachments"
            subtitle="Pro Family option for original files and uploaded images in the packet scope."
            active={!!scope.includeAttachments}
            onPress={() => setScope((current) => ({ ...current, includeAttachments: !current.includeAttachments }))}
          />
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
            Doctor Packet | {describeDateRange(scope)}
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
                  ['Files', preview?.totalAttachments ?? 0]
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
                  <View key={domain.domain} style={{ flexDirection: 'row', gap: 10 }}>
                    <Text style={{ color: THEME.colors.text, flex: 1, fontWeight: '800' }}>{domainLabel(domain.domain)}</Text>
                    <Text style={{ color: THEME.colors.muted }}>{domain.count} records</Text>
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

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
        <Pressable
          disabled={buildMutation.isPending || !canBuild}
          onPress={() => buildMutation.mutate()}
          style={{
            flex: 1,
            minHeight: 52,
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: canBuild ? THEME.colors.teal : THEME.colors.border,
            flexDirection: 'row',
            gap: 8
          }}
        >
          {buildMutation.isPending ? <ActivityIndicator color={THEME.colors.bg} /> : <FileText color={THEME.colors.bg} size={18} />}
          <Text style={{ color: THEME.colors.bg, fontSize: 15, fontWeight: '900' }}>Generate PDF</Text>
        </Pressable>
        <Pressable
          disabled={!pdfUri || shareMutation.isPending}
          onPress={() => shareMutation.mutate()}
          style={{
            minHeight: 52,
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pdfUri ? THEME.colors.elevated : THEME.colors.border,
            borderWidth: 1,
            borderColor: THEME.colors.border,
            paddingHorizontal: 16
          }}
        >
          <Share2 color={pdfUri ? THEME.colors.teal : THEME.colors.faint} size={19} />
        </Pressable>
      </View>
      {pdfUri && <Text style={{ color: THEME.colors.green, marginTop: 10, fontWeight: '800' }}>PDF generated and ready to share.</Text>}
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

function chipStyle(selected: boolean) {
  return {
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: selected ? THEME.colors.teal : THEME.colors.border,
    backgroundColor: selected ? 'rgba(0, 212, 170, 0.10)' : THEME.colors.surface,
    borderRadius: 8
  };
}

function chipTextStyle(selected: boolean) {
  return {
    color: selected ? THEME.colors.teal : THEME.colors.muted,
    fontWeight: '900' as const
  };
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
