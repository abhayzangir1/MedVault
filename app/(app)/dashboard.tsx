import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarDays, CheckCircle2, Crown, FileText, HeartPulse, Pill, ShieldCheck, UsersRound } from 'lucide-react-native';
import { useState } from 'react';
import { UpgradeBanner } from '@/components/UpgradeBanner';
import { SUBSCRIPTION_LIMITS, THEME } from '@/lib/constants';
import { queryKeys } from '@/lib/queryKeys';
import { canAddFamilyMember, canUseAi, getBillingRegion, isProProfile } from '@/lib/subscription';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardService } from '@/services/dashboard.service';
import { useProfileStore } from '@/store/useProfileStore';
import type { HealthEvent, Medication, OnboardingProgress } from '@/types';

export default function DashboardScreen() {
  const { user } = useAuth();
  const { profile, activeCareProfileId, familyMembers } = useProfileStore();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const userId = user?.id ?? '';

  const summaryQuery = useQuery({
    queryKey: queryKeys.dashboard(userId, activeCareProfileId),
    queryFn: () => dashboardService.getSummary(userId, activeCareProfileId),
    enabled: !!userId
  });

  const displayName = profile?.full_name ?? user?.user_metadata?.full_name ?? 'there';
  const activeFamilyMember = familyMembers.find((member) => member.id === activeCareProfileId);
  const activeVaultName = activeFamilyMember?.full_name ?? 'My Vault';
  const isPro = isProProfile(profile);
  const region = profile?.billing_region ?? getBillingRegion(profile?.country);
  const familyGate = canAddFamilyMember(profile, familyMembers.length);
  const aiGate = canUseAi(profile);
  const summary = summaryQuery.data;

  const refresh = async () => {
    if (!userId) return;
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.familyProfiles(userId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(userId, activeCareProfileId) })
    ]);
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: THEME.colors.bg }}
      contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 110 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={THEME.colors.teal} />}
    >
      <Text style={{ color: THEME.colors.muted, fontSize: 14 }}>Good to see you,</Text>
      <Text style={{ color: THEME.colors.text, fontSize: 30, fontWeight: '800', marginTop: 4 }}>
        {displayName}
      </Text>
      <Text style={{ color: THEME.colors.teal, fontSize: 13, fontWeight: '800', marginTop: 8 }}>
        {activeVaultName}
      </Text>

      {!isPro && (!familyGate.allowed || !aiGate.allowed) ? (
        <View style={{ marginTop: 16 }}>
          <UpgradeBanner
            region={region}
            message={familyGate.reason ?? aiGate.reason ?? 'Upgrade to unlock more care profiles and AI/OCR features.'}
          />
        </View>
      ) : null}

      {summaryQuery.isLoading ? (
        <View style={{ paddingVertical: 52, alignItems: 'center' }}>
          <ActivityIndicator color={THEME.colors.teal} size="large" />
          <Text style={{ color: THEME.colors.muted, marginTop: 12 }}>Loading health dashboard...</Text>
        </View>
      ) : summaryQuery.isError ? (
        <StateCard
          icon={<AlertTriangle color={THEME.colors.amber} size={24} />}
          title="Dashboard unavailable"
          body="Connect Supabase env values and run the database migration before testing live dashboard data."
        />
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 22 }}>
            <Metric label="Events this month" value={String(summary?.eventsThisMonth ?? 0)} icon={<HeartPulse color={THEME.colors.teal} size={18} />} />
            <Metric label="Active meds" value={String(summary?.activeMedications ?? 0)} icon={<Pill color={THEME.colors.blue} size={18} />} />
            <Metric label="Check-ins today" value={String(summary?.todayCheckins ?? 0)} icon={<CheckCircle2 color={THEME.colors.green} size={18} />} />
            <Metric label="Activity score" value={String(summary?.activityScore ?? 0)} icon={<CalendarDays color={THEME.colors.purple} size={18} />} />
          </View>

          <OnboardingCard onboarding={summary?.onboarding ?? null} />
          <RefillSection refills={summary?.upcomingRefills ?? []} />
          <RecentEventsSection events={summary?.recentEvents ?? []} />
        </>
      )}

      <Text style={{ color: THEME.colors.text, fontSize: 18, fontWeight: '800', marginTop: 28, marginBottom: 12 }}>
        Plan status
      </Text>
      <View style={{ gap: 12 }}>
        <InfoCard
          icon={<ShieldCheck color={THEME.colors.teal} size={22} />}
          title={activeVaultName}
          value="Active care profile"
          body="Dashboard records are filtered by the selected care profile. The Care Profiles slice will add switching controls."
        />
        <InfoCard
          icon={<Crown color={THEME.colors.amber} size={22} />}
          title={isPro ? 'Pro Family active' : 'Free plan'}
          value={isPro ? `${SUBSCRIPTION_LIMITS.proAdditionalCareProfiles} care profiles + ${SUBSCRIPTION_LIMITS.proAiOrOcrUsesPerMonth} AI/OCR uses/mo` : `${SUBSCRIPTION_LIMITS.freeAdditionalCareProfiles} care profile + ${SUBSCRIPTION_LIMITS.freeAiOrOcrUsesPerMonth} AI/OCR uses/mo`}
          body="Regional Pro Family pricing is configured for India and international users. Google Play Billing activates during the billing phase."
        />
        <InfoCard
          icon={<UsersRound color={THEME.colors.blue} size={22} />}
          title="Care profiles"
          value={`${familyMembers.length}/${isPro ? SUBSCRIPTION_LIMITS.proAdditionalCareProfiles : SUBSCRIPTION_LIMITS.freeAdditionalCareProfiles}`}
          body="All feature services now move toward active care profile IDs so Doctor Packet, Export, AI, and Emergency ID stay connected."
        />
      </View>
    </ScrollView>
  );
}

interface MetricProps {
  label: string;
  value: string;
  icon: ReactNode;
}

function Metric({ label, value, icon }: MetricProps) {
  return (
    <View style={{ width: '47.8%', minHeight: 104, borderWidth: 1, borderColor: THEME.colors.border, borderRadius: 8, backgroundColor: THEME.colors.surface, padding: 14 }}>
      {icon}
      <Text style={{ color: THEME.colors.text, fontSize: 25, fontWeight: '900', marginTop: 10 }}>{value}</Text>
      <Text style={{ color: THEME.colors.faint, fontSize: 12, fontWeight: '700', marginTop: 2 }}>{label}</Text>
    </View>
  );
}

interface InfoCardProps {
  icon: ReactNode;
  title: string;
  value: string;
  body: string;
}

function InfoCard({ icon, title, value, body }: InfoCardProps) {
  return (
    <View style={{ borderWidth: 1, borderColor: THEME.colors.border, backgroundColor: THEME.colors.surface, borderRadius: 8, padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {icon}
        <View style={{ flex: 1 }}>
          <Text style={{ color: THEME.colors.text, fontSize: 16, fontWeight: '800' }}>{title}</Text>
          <Text style={{ color: THEME.colors.teal, fontSize: 13, fontWeight: '700', marginTop: 2 }}>{value}</Text>
        </View>
      </View>
      <Text style={{ color: THEME.colors.muted, fontSize: 13, lineHeight: 20, marginTop: 12 }}>{body}</Text>
    </View>
  );
}

interface StateCardProps {
  icon: ReactNode;
  title: string;
  body: string;
}

function StateCard({ icon, title, body }: StateCardProps) {
  return (
    <View style={{ marginTop: 22, borderWidth: 1, borderColor: THEME.colors.border, backgroundColor: THEME.colors.surface, borderRadius: 8, padding: 18, alignItems: 'center' }}>
      {icon}
      <Text style={{ color: THEME.colors.text, fontSize: 17, fontWeight: '800', marginTop: 10 }}>{title}</Text>
      <Text style={{ color: THEME.colors.muted, textAlign: 'center', lineHeight: 20, marginTop: 6 }}>{body}</Text>
    </View>
  );
}

function OnboardingCard({ onboarding }: { onboarding: OnboardingProgress | null }) {
  const items = [
    { label: 'Add first timeline event', done: onboarding?.added_first_event === true },
    { label: 'Add first medication', done: onboarding?.added_first_medication === true },
    { label: 'Upload first document', done: onboarding?.uploaded_first_document === true }
  ];

  return (
    <View style={{ marginTop: 28, borderWidth: 1, borderColor: THEME.colors.border, backgroundColor: THEME.colors.surface, borderRadius: 8, padding: 16 }}>
      <Text style={{ color: THEME.colors.text, fontSize: 17, fontWeight: '800' }}>Onboarding</Text>
      <Text style={{ color: THEME.colors.muted, fontSize: 13, lineHeight: 20, marginTop: 4 }}>
        These checklist items update as feature slices come online.
      </Text>
      <View style={{ gap: 10, marginTop: 14 }}>
        {items.map((item) => (
          <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <CheckCircle2 color={item.done ? THEME.colors.green : THEME.colors.faint} size={18} />
            <Text style={{ color: item.done ? THEME.colors.text : THEME.colors.muted, fontWeight: '700' }}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function RefillSection({ refills }: { refills: Medication[] }) {
  return (
    <View style={{ marginTop: 28 }}>
      <Text style={{ color: THEME.colors.text, fontSize: 18, fontWeight: '800', marginBottom: 12 }}>Upcoming refills</Text>
      {refills.length === 0 ? (
        <StateCard icon={<Pill color={THEME.colors.blue} size={22} />} title="No refills due soon" body="Medications with refill dates in the next 7 days will appear here." />
      ) : (
        <View style={{ gap: 10 }}>
          {refills.map((medication) => (
            <View key={medication.id} style={{ borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.35)', backgroundColor: 'rgba(245, 158, 11, 0.08)', borderRadius: 8, padding: 14 }}>
              <Text style={{ color: THEME.colors.text, fontSize: 15, fontWeight: '800' }}>{medication.drug_name}</Text>
              <Text style={{ color: THEME.colors.muted, marginTop: 4 }}>{medication.dosage} · {medication.frequency}</Text>
              <Text style={{ color: THEME.colors.amber, fontWeight: '800', marginTop: 6 }}>
                Refill by {medication.refill_date ? formatDate(medication.refill_date) : 'Not set'}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function RecentEventsSection({ events }: { events: HealthEvent[] }) {
  return (
    <View style={{ marginTop: 28 }}>
      <Text style={{ color: THEME.colors.text, fontSize: 18, fontWeight: '800', marginBottom: 12 }}>Recent events</Text>
      {events.length === 0 ? (
        <StateCard icon={<FileText color={THEME.colors.teal} size={22} />} title="No health events yet" body="Timeline events will appear here after the Timeline slice is implemented." />
      ) : (
        <View style={{ gap: 10 }}>
          {events.map((event) => (
            <View key={event.id} style={{ borderWidth: 1, borderColor: event.is_critical ? 'rgba(239, 68, 68, 0.35)' : THEME.colors.border, backgroundColor: THEME.colors.surface, borderRadius: 8, padding: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: THEME.colors.text, fontSize: 15, fontWeight: '800', flex: 1 }}>{event.title}</Text>
                {event.is_critical ? <AlertTriangle color={THEME.colors.red} size={17} /> : null}
              </View>
              <Text style={{ color: THEME.colors.muted, marginTop: 4 }}>{event.category.replace('_', ' ')} · {formatDate(event.event_date)}</Text>
              {event.description ? (
                <Text style={{ color: THEME.colors.faint, lineHeight: 19, marginTop: 6 }} numberOfLines={2}>{event.description}</Text>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
