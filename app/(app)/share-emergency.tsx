import { useMemo, useState } from 'react';
import type React from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'react-native-qrcode-svg';
import { Link2, QrCode, ShieldCheck, X } from 'lucide-react-native';
import {
  DATA_DOMAIN_OPTIONS,
  DATE_RANGE_OPTIONS,
  DataDomain,
  DataScopeSelection,
  DateRangePreset,
  DEFAULT_EMERGENCY_SCOPE,
  DEFAULT_SHARE_LINK_SCOPE,
  describeDateRange
} from '@/lib/dataScopes';
import { THEME } from '@/lib/constants';
import { queryKeys } from '@/lib/queryKeys';
import { useAuth } from '@/contexts/AuthContext';
import { dataPacketService } from '@/services/data-packet.service';
import { buildResponderUrl, sharingService } from '@/services/sharing.service';
import { useProfileStore } from '@/store/useProfileStore';
import type { ShareLinkRecord } from '@/types';

const shareDomains = DATA_DOMAIN_OPTIONS.filter((domain) => domain.id !== 'emergency' && domain.id !== 'family');
const emergencyDomains = DATA_DOMAIN_OPTIONS.filter((domain) => (
  domain.id === 'profile' ||
  domain.id === 'emergency' ||
  domain.id === 'medications' ||
  domain.id === 'timeline' ||
  domain.id === 'labs'
));

function toggleValue<T extends string>(values: T[], value: T) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function domainLabel(domain: string) {
  return DATA_DOMAIN_OPTIONS.find((option) => option.id === domain)?.label ?? domain;
}

export default function ShareEmergencyScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { profile, careProfiles, activeCareProfileId } = useProfileStore();
  const userId = user?.id ?? '';
  const [label, setLabel] = useState('');
  const [shareScope, setShareScope] = useState<DataScopeSelection>(() => ({
    ...DEFAULT_SHARE_LINK_SCOPE,
    domains: [...DEFAULT_SHARE_LINK_SCOPE.domains],
    careProfileIds: activeCareProfileId ? [activeCareProfileId] : []
  }));
  const [emergencyCareProfileId, setEmergencyCareProfileId] = useState(activeCareProfileId ?? '');
  const [emergencyScope, setEmergencyScope] = useState<DataScopeSelection>(() => ({
    ...DEFAULT_EMERGENCY_SCOPE,
    domains: [...DEFAULT_EMERGENCY_SCOPE.domains],
    careProfileIds: activeCareProfileId ? [activeCareProfileId] : []
  }));

  const shareLinksQuery = useQuery({
    queryKey: queryKeys.shareLinks(userId),
    enabled: !!userId,
    queryFn: () => sharingService.getActiveShareLinks(userId)
  });

  const emergencyScopesQuery = useQuery({
    queryKey: queryKeys.emergencyScopes(userId),
    enabled: !!userId,
    queryFn: () => sharingService.getEmergencyScopes(userId)
  });

  const sharePreviewQuery = useQuery({
    queryKey: user ? queryKeys.dataPacketPreview(user.id, `share-${JSON.stringify(shareScope)}`) : ['share-preview', 'anonymous'],
    enabled: !!user,
    queryFn: () => dataPacketService.getPreview(user!.id, careProfiles, shareScope)
  });

  const emergencyPreviewQuery = useQuery({
    queryKey: user ? queryKeys.dataPacketPreview(user.id, `emergency-${JSON.stringify(emergencyScope)}`) : ['emergency-preview', 'anonymous'],
    enabled: !!user,
    queryFn: () => dataPacketService.getPreview(user!.id, careProfiles, emergencyScope)
  });

  const emergencyScopeRecord = useMemo(() => {
    return (emergencyScopesQuery.data ?? []).find((item) => item.care_profile_id === emergencyCareProfileId && item.enabled);
  }, [emergencyCareProfileId, emergencyScopesQuery.data]);
  const emergencyUrl = emergencyScopeRecord ? buildResponderUrl(emergencyScopeRecord.token) : null;

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.shareLinks(userId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.emergencyScopes(userId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.careProfiles(userId) })
    ]);
  };

  const createShareLinkMutation = useMutation({
    mutationFn: () => sharingService.createShareLink(
      userId,
      profile,
      careProfiles,
      shareScope,
      shareLinksQuery.data?.length ?? 0,
      label
    ),
    onSuccess: async (link) => {
      await invalidate();
      setLabel('');
      await Share.share({ message: buildResponderUrl(link.token) });
    },
    onError: showError
  });

  const revokeMutation = useMutation({
    mutationFn: (linkId: string) => sharingService.revokeShareLink(userId, linkId),
    onSuccess: invalidate,
    onError: showError
  });

  const configureEmergencyMutation = useMutation({
    mutationFn: () => sharingService.configureEmergencyScope(userId, emergencyCareProfileId, {
      ...emergencyScope,
      careProfileIds: [emergencyCareProfileId],
      purpose: 'emergency_id',
      includeAttachments: false
    }),
    onSuccess: invalidate,
    onError: showError
  });

  const disableEmergencyMutation = useMutation({
    mutationFn: () => sharingService.disableEmergencyScope(userId, emergencyCareProfileId),
    onSuccess: invalidate,
    onError: showError
  });

  const selectedEmergencyProfile = careProfiles.find((careProfile) => careProfile.id === emergencyCareProfileId);

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
          <ShieldCheck color={THEME.colors.teal} size={22} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: THEME.colors.text, fontSize: 28, fontWeight: '900' }}>Share + Emergency</Text>
          <Text style={{ color: THEME.colors.muted, marginTop: 3 }}>Only selected data leaves the vault.</Text>
          <Text style={{ color: THEME.colors.faint, lineHeight: 18, marginTop: 6 }}>
            Responder pages show user-entered data only and may be incomplete.
          </Text>
        </View>
      </View>

      <Section title="Doctor Share Link">
        <TextInput
          placeholder="Label, e.g. Dr. Sharma follow-up"
          placeholderTextColor={THEME.colors.faint}
          value={label}
          onChangeText={setLabel}
          style={inputStyle}
        />
        <SelectorBlock
          title="Care profiles"
          items={careProfiles.map((careProfile) => ({ id: careProfile.id, label: careProfile.full_name }))}
          selected={shareScope.careProfileIds}
          onToggle={(id) => setShareScope((current) => ({ ...current, careProfileIds: toggleValue(current.careProfileIds, id) }))}
        />
        <SelectorBlock
          title="Domains"
          items={shareDomains.map((domain) => ({ id: domain.id, label: domain.label }))}
          selected={shareScope.domains}
          onToggle={(id) => setShareScope((current) => ({ ...current, domains: toggleValue(current.domains, id as DataDomain) }))}
        />
        <RangeSelector scope={shareScope} onChange={setShareScope} />
        <ToggleRow
          title="Critical only"
          subtitle="Share only urgent or abnormal records from the selected domains."
          active={!!shareScope.includeCriticalOnly}
          onPress={() => setShareScope((current) => ({ ...current, includeCriticalOnly: !current.includeCriticalOnly }))}
        />
        <ToggleRow
          title="Include attachments"
          subtitle="Pro Family only. Public packets otherwise show metadata, not original files."
          active={!!shareScope.includeAttachments}
          onPress={() => setShareScope((current) => ({ ...current, includeAttachments: !current.includeAttachments }))}
        />
        <PreviewCard loading={sharePreviewQuery.isLoading} preview={sharePreviewQuery.data} />
        <Pressable
          disabled={createShareLinkMutation.isPending}
          onPress={() => createShareLinkMutation.mutate()}
          style={primaryButtonStyle}
        >
          {createShareLinkMutation.isPending ? <ActivityIndicator color={THEME.colors.bg} /> : <Link2 color={THEME.colors.bg} size={18} />}
          <Text style={{ color: THEME.colors.bg, fontWeight: '900' }}>Create Scoped Link</Text>
        </Pressable>
      </Section>

      <Section title="Active Links">
        {shareLinksQuery.isLoading ? <ActivityIndicator color={THEME.colors.teal} /> : (shareLinksQuery.data ?? []).length === 0 ? (
          <Text style={{ color: THEME.colors.muted }}>No active share links.</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {(shareLinksQuery.data ?? []).map((link) => (
              <ShareLinkCard
                key={link.id}
                link={link}
                onShare={() => Share.share({ message: buildResponderUrl(link.token) })}
                onRevoke={() => revokeMutation.mutate(link.id)}
              />
            ))}
          </View>
        )}
      </Section>

      <Section title="Emergency ID">
        <NoticeText text="Emergency ID is not a substitute for emergency services or clinician-verified records. It exposes only the fields selected below." />
        <SelectorBlock
          title="Care profile"
          items={careProfiles.map((careProfile) => ({ id: careProfile.id, label: careProfile.full_name }))}
          selected={emergencyCareProfileId ? [emergencyCareProfileId] : []}
          single
          onToggle={(id) => {
            setEmergencyCareProfileId(id);
            setEmergencyScope((current) => ({ ...current, careProfileIds: [id] }));
          }}
        />
        {selectedEmergencyProfile && (
          <View style={{
            borderWidth: 1,
            borderColor: THEME.colors.border,
            borderRadius: 8,
            backgroundColor: THEME.colors.surface,
            padding: 14,
            marginTop: 10
          }}>
            <Text style={{ color: THEME.colors.text, fontWeight: '900' }}>{selectedEmergencyProfile.full_name}</Text>
            <Text style={{ color: THEME.colors.muted, marginTop: 5 }}>
              Blood: {selectedEmergencyProfile.blood_type ?? 'Unknown'} | Emergency: {selectedEmergencyProfile.emergency_contact_phone ?? 'Missing'}
            </Text>
          </View>
        )}
        <SelectorBlock
          title="Emergency-safe domains"
          items={emergencyDomains.map((domain) => ({ id: domain.id, label: domain.label }))}
          selected={emergencyScope.domains}
          onToggle={(id) => setEmergencyScope((current) => ({ ...current, domains: toggleValue(current.domains, id as DataDomain) }))}
        />
        <RangeSelector scope={emergencyScope} onChange={setEmergencyScope} />
        <ToggleRow
          title="Critical only"
          subtitle="Recommended for Emergency ID. Keeps the responder page focused."
          active={!!emergencyScope.includeCriticalOnly}
          onPress={() => setEmergencyScope((current) => ({ ...current, includeCriticalOnly: !current.includeCriticalOnly }))}
        />
        <PreviewCard loading={emergencyPreviewQuery.isLoading} preview={emergencyPreviewQuery.data} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable
            disabled={!emergencyCareProfileId || configureEmergencyMutation.isPending}
            onPress={() => configureEmergencyMutation.mutate()}
            style={[primaryButtonStyle, { flex: 1 }]}
          >
            {configureEmergencyMutation.isPending ? <ActivityIndicator color={THEME.colors.bg} /> : <QrCode color={THEME.colors.bg} size={18} />}
            <Text style={{ color: THEME.colors.bg, fontWeight: '900' }}>Enable QR</Text>
          </Pressable>
          <Pressable
            disabled={!emergencyScopeRecord || disableEmergencyMutation.isPending}
            onPress={() => disableEmergencyMutation.mutate()}
            style={{
              minHeight: 48,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: 'rgba(239, 68, 68, 0.35)',
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 14
            }}
          >
            <X color={THEME.colors.red} size={18} />
          </Pressable>
        </View>
        {emergencyUrl && (
          <View style={{
            borderWidth: 1,
            borderColor: THEME.colors.border,
            borderRadius: 8,
            backgroundColor: THEME.colors.surface,
            padding: 16,
            marginTop: 12,
            alignItems: 'center',
            gap: 12
          }}>
            <QRCode value={emergencyUrl} size={180} backgroundColor={THEME.colors.surface} color={THEME.colors.text} />
            <Text style={{ color: THEME.colors.muted, textAlign: 'center' }}>{emergencyUrl}</Text>
            <Pressable onPress={() => Share.share({ message: emergencyUrl })} style={secondaryButtonStyle}>
              <Text style={{ color: THEME.colors.teal, fontWeight: '900' }}>Share Emergency Link</Text>
            </Pressable>
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

function NoticeText({ text }: { text: string }) {
  return (
    <Text style={{ color: THEME.colors.faint, lineHeight: 19 }}>
      {text}
    </Text>
  );
}

function SelectorBlock({ title, items, selected, onToggle, single }: {
  title: string;
  items: Array<{ id: string; label: string }>;
  selected: string[];
  onToggle: (id: string) => void;
  single?: boolean;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: THEME.colors.faint, fontSize: 12, fontWeight: '900' }}>{title}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {items.map((item) => {
          const active = selected.includes(item.id);
          return (
            <Pressable key={item.id} onPress={() => onToggle(item.id)} style={chipStyle(active)}>
              <Text style={chipTextStyle(active)}>{single && active ? `${item.label}` : item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function RangeSelector({ scope, onChange }: {
  scope: DataScopeSelection;
  onChange: React.Dispatch<React.SetStateAction<DataScopeSelection>>;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: THEME.colors.faint, fontSize: 12, fontWeight: '900' }}>Date range</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {DATE_RANGE_OPTIONS.map((range) => {
          const active = scope.dateRange === range.id;
          return (
            <Pressable
              key={range.id}
              onPress={() => onChange((current) => ({ ...current, dateRange: range.id as DateRangePreset }))}
              style={chipStyle(active)}
            >
              <Text style={chipTextStyle(active)}>{range.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={{ color: THEME.colors.faint }}>{describeDateRange(scope)}</Text>
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

function PreviewCard({ loading, preview }: { loading: boolean; preview?: { totalRecords: number; totalAttachments: number; criticalRecords: number; domains: Array<{ domain: string; count: number }> } }) {
  if (loading) return <ActivityIndicator color={THEME.colors.teal} />;
  return (
    <View style={{
      borderWidth: 1,
      borderColor: THEME.colors.border,
      backgroundColor: THEME.colors.surface,
      borderRadius: 8,
      padding: 12,
      gap: 8
    }}>
      <Text style={{ color: THEME.colors.text, fontWeight: '900' }}>
        {preview?.totalRecords ?? 0} records | {preview?.criticalRecords ?? 0} critical | {preview?.totalAttachments ?? 0} files
      </Text>
      {(preview?.domains ?? []).map((domain) => (
        <Text key={domain.domain} style={{ color: THEME.colors.muted }}>{domainLabel(domain.domain)}: {domain.count}</Text>
      ))}
    </View>
  );
}

function ShareLinkCard({ link, onShare, onRevoke }: { link: ShareLinkRecord; onShare: () => void; onRevoke: () => void }) {
  return (
    <View style={{ borderWidth: 1, borderColor: THEME.colors.border, backgroundColor: THEME.colors.surface, borderRadius: 8, padding: 14 }}>
      <Text style={{ color: THEME.colors.text, fontWeight: '900' }}>{link.label ?? 'Share link'}</Text>
      <Text style={{ color: THEME.colors.faint, marginTop: 4 }}>Expires {new Date(link.expires_at).toLocaleString()} | Opened {link.access_count}</Text>
      <Text style={{ color: THEME.colors.muted, marginTop: 8 }} numberOfLines={1}>{buildResponderUrl(link.token)}</Text>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <Pressable onPress={onShare} style={[secondaryButtonStyle, { flex: 1 }]}>
          <Text style={{ color: THEME.colors.teal, fontWeight: '900' }}>Share</Text>
        </Pressable>
        <Pressable onPress={onRevoke} style={[secondaryButtonStyle, { borderColor: 'rgba(239, 68, 68, 0.35)' }]}>
          <Text style={{ color: THEME.colors.red, fontWeight: '900' }}>Revoke</Text>
        </Pressable>
      </View>
    </View>
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

const primaryButtonStyle = {
  minHeight: 48,
  borderRadius: 8,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  backgroundColor: THEME.colors.teal,
  flexDirection: 'row' as const,
  gap: 8
};

const secondaryButtonStyle = {
  minHeight: 40,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: THEME.colors.border,
  backgroundColor: THEME.colors.elevated,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  paddingHorizontal: 14
};

function showError(error: Error) {
  Alert.alert('Sharing error', error.message);
}
