import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert, UserPlus, UsersRound } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { BLOOD_TYPE_OPTIONS, RELATIONSHIP_OPTIONS, THEME } from '@/lib/constants';
import { queryKeys } from '@/lib/queryKeys';
import { canAddFamilyMember, getProPriceLabel, isProProfile } from '@/lib/subscription';
import { caregiverDashboardService } from '@/services/caregiver-dashboard.service';
import { careProfileService } from '@/services/care-profile.service';
import { useProfileStore } from '@/store/useProfileStore';
import type { BloodType, CareProfile, CareProfileInput, Relationship } from '@/types';

const emptyForm: CareProfileInput = {
  relationship: 'parent',
  full_name: '',
  date_of_birth: '',
  blood_type: 'Unknown',
  gender: '',
  allergies: [],
  chronic_conditions: [],
  emergency_contact_name: '',
  emergency_contact_phone: '',
  emergency_contact_relation: ''
};

function csvToArray(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function arrayToCsv(value?: string[] | null) {
  return value?.join(', ') ?? '';
}

function formFromProfile(profile: CareProfile): CareProfileInput {
  return {
    relationship: profile.relationship,
    full_name: profile.full_name,
    date_of_birth: profile.date_of_birth ?? '',
    blood_type: profile.blood_type ?? 'Unknown',
    gender: profile.gender ?? '',
    allergies: profile.allergies ?? [],
    chronic_conditions: profile.chronic_conditions ?? [],
    emergency_contact_name: profile.emergency_contact_name ?? '',
    emergency_contact_phone: profile.emergency_contact_phone ?? '',
    emergency_contact_relation: profile.emergency_contact_relation ?? ''
  };
}

function summaryValue(value: number, suffix = '') {
  return `${Number.isInteger(value) ? value : value.toFixed(0)}${suffix}`;
}

export default function CareProfilesScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const {
    profile,
    activeCareProfileId,
    careProfiles,
    familyMembers,
    setActiveCareProfileId,
    setCareProfiles
  } = useProfileStore();
  const [editingProfile, setEditingProfile] = useState<CareProfile | null>(null);
  const [form, setForm] = useState<CareProfileInput>(emptyForm);
  const [allergiesText, setAllergiesText] = useState('');
  const [conditionsText, setConditionsText] = useState('');

  const gate = useMemo(
    () => canAddFamilyMember(profile, familyMembers.filter((member) => member.is_active).length),
    [familyMembers, profile]
  );
  const proEnabled = isProProfile(profile);

  const caregiverQuery = useQuery({
    queryKey: user ? queryKeys.caregiverDashboard(user.id) : ['caregiver-dashboard', 'anonymous'],
    enabled: !!user && careProfiles.length > 0,
    queryFn: () => caregiverDashboardService.getSummary(user!.id, careProfiles)
  });

  const refreshCareProfiles = async () => {
    if (!user || !profile) return;
    const nextCareProfiles = await careProfileService.getCareProfiles(user.id, profile);
    setCareProfiles(nextCareProfiles);
    queryClient.invalidateQueries({ queryKey: queryKeys.caregiverDashboard(user.id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(user.id, activeCareProfileId) });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user || !profile) throw new Error('Sign in again to save care profiles.');
      const payload: CareProfileInput = {
        ...form,
        full_name: form.full_name.trim(),
        allergies: csvToArray(allergiesText),
        chronic_conditions: csvToArray(conditionsText)
      };

      if (!payload.full_name) throw new Error('Enter a care profile name.');

      if (editingProfile) {
        await careProfileService.updateCareProfile(user.id, profile, editingProfile.id, payload);
        return;
      }

      const created = await careProfileService.createFamilyCareProfile(user.id, profile, familyMembers.length, payload);
      setActiveCareProfileId(created.id);
    },
    onSuccess: async () => {
      setEditingProfile(null);
      setForm(emptyForm);
      setAllergiesText('');
      setConditionsText('');
      await refreshCareProfiles();
    },
    onError: (error) => {
      Alert.alert('Care profile not saved', error instanceof Error ? error.message : 'Please try again.');
    }
  });

  const deactivateMutation = useMutation({
    mutationFn: async (careProfileId: string) => {
      if (!user || !profile) throw new Error('Sign in again to update care profiles.');
      await careProfileService.deactivateCareProfile(user.id, profile, careProfileId);
    },
    onSuccess: refreshCareProfiles,
    onError: (error) => {
      Alert.alert('Could not deactivate profile', error instanceof Error ? error.message : 'Please try again.');
    }
  });

  const startEdit = (careProfile: CareProfile) => {
    setEditingProfile(careProfile);
    setForm(formFromProfile(careProfile));
    setAllergiesText(arrayToCsv(careProfile.allergies));
    setConditionsText(arrayToCsv(careProfile.chronic_conditions));
  };

  const resetForm = () => {
    setEditingProfile(null);
    setForm(emptyForm);
    setAllergiesText('');
    setConditionsText('');
  };

  const summary = caregiverQuery.data;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: THEME.colors.bg }}
      contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 120 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <View style={{
          width: 44,
          height: 44,
          borderRadius: 8,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 212, 170, 0.12)'
        }}>
          <UsersRound color={THEME.colors.teal} size={22} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: THEME.colors.text, fontSize: 28, fontWeight: '900' }}>Care Profiles</Text>
          <Text style={{ color: THEME.colors.muted, marginTop: 3 }}>Switch, manage, and monitor family health in one place.</Text>
        </View>
      </View>

      <View style={{
        borderWidth: 1,
        borderColor: proEnabled ? 'rgba(0, 212, 170, 0.45)' : THEME.colors.border,
        borderRadius: 8,
        backgroundColor: THEME.colors.surface,
        padding: 14,
        marginTop: 14
      }}>
        <Text style={{ color: THEME.colors.text, fontWeight: '900', fontSize: 16 }}>
          {proEnabled ? 'Pro Family active' : 'Free family limit'}
        </Text>
        <Text style={{ color: THEME.colors.muted, lineHeight: 21, marginTop: 6 }}>
          {proEnabled
            ? 'You can keep up to 5 additional active care profiles with caregiver dashboard, advanced packets, and higher AI/OCR quota.'
            : `Free includes 1 additional care profile. Pro Family unlocks 5 additional profiles at ${getProPriceLabel(profile?.billing_region ?? 'IN')}.`}
        </Text>
        {!gate.allowed && (
          <Text style={{ color: THEME.colors.amber, marginTop: 8, fontWeight: '800' }}>{gate.reason}</Text>
        )}
      </View>

      <Text style={{ color: THEME.colors.text, fontSize: 18, fontWeight: '900', marginTop: 24, marginBottom: 10 }}>
        Active Profiles
      </Text>
      <View style={{ gap: 10 }}>
        {careProfiles.map((careProfile) => {
          const active = activeCareProfileId === careProfile.id;
          return (
            <Pressable
              key={careProfile.id}
              onPress={() => setActiveCareProfileId(careProfile.id)}
              style={{
                borderWidth: 1,
                borderColor: active ? THEME.colors.teal : THEME.colors.border,
                backgroundColor: active ? 'rgba(0, 212, 170, 0.10)' : THEME.colors.surface,
                borderRadius: 8,
                padding: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12
              }}
            >
              <View style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: THEME.colors.elevated
              }}>
                <Text style={{ color: THEME.colors.text, fontWeight: '900' }}>{careProfile.full_name.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: THEME.colors.text, fontWeight: '900', fontSize: 15 }}>{careProfile.full_name}</Text>
                <Text style={{ color: THEME.colors.faint, marginTop: 2, textTransform: 'capitalize' }}>
                  {careProfile.kind === 'self' ? 'Self' : careProfile.relationship}
                  {careProfile.blood_type ? `  |  ${careProfile.blood_type}` : ''}
                </Text>
              </View>
              <Pressable onPress={() => startEdit(careProfile)} hitSlop={10}>
                <Text style={{ color: THEME.colors.teal, fontWeight: '900' }}>EDIT</Text>
              </Pressable>
            </Pressable>
          );
        })}
      </View>

      <Text style={{ color: THEME.colors.text, fontSize: 18, fontWeight: '900', marginTop: 26, marginBottom: 10 }}>
        Caregiver Dashboard
      </Text>
      {caregiverQuery.isLoading ? (
        <ActivityIndicator color={THEME.colors.teal} />
      ) : (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {[
              ['Profiles', summaryValue(summary?.activeCareProfiles ?? careProfiles.length)],
              ['Meds Today', summaryValue(summary?.medicinesDueToday ?? 0)],
              ['Missed', summaryValue(summary?.missedMedicationCheckins ?? 0)],
              ['Refills', summaryValue(summary?.upcomingRefills ?? 0)],
              ['Abnormal Labs', summaryValue(summary?.abnormalLabs ?? 0)],
              ['Critical Labs', summaryValue(summary?.criticalLabs ?? 0)],
              ['Follow-ups', summaryValue(summary?.followUpsDue ?? 0)],
              ['Emergency Gaps', summaryValue(summary?.missingEmergencyInfo ?? 0)],
              ['Month Spend', `₹${summaryValue(summary?.monthlyOutOfPocket ?? 0)}`]
            ].map(([label, value]) => (
              <View key={label} style={{
                width: '31%',
                minWidth: 100,
                borderWidth: 1,
                borderColor: THEME.colors.border,
                borderRadius: 8,
                backgroundColor: THEME.colors.surface,
                padding: 12
              }}>
                <Text style={{ color: THEME.colors.faint, fontSize: 11, fontWeight: '800' }}>{label}</Text>
                <Text style={{ color: THEME.colors.text, fontSize: 20, fontWeight: '900', marginTop: 5 }}>{value}</Text>
              </View>
            ))}
          </View>

          <View style={{
            borderWidth: 1,
            borderColor: THEME.colors.border,
            borderRadius: 8,
            backgroundColor: THEME.colors.surface,
            padding: 14
          }}>
            <Text style={{ color: THEME.colors.text, fontSize: 15, fontWeight: '900', marginBottom: 10 }}>Recent Family Activity</Text>
            {summary?.recentActivity.length ? summary.recentActivity.map((activity) => (
              <View key={`${activity.type}-${activity.id}`} style={{
                borderTopWidth: 1,
                borderTopColor: THEME.colors.border,
                paddingVertical: 10,
                flexDirection: 'row',
                gap: 10,
                alignItems: 'center'
              }}>
                {activity.is_critical && <ShieldAlert color={THEME.colors.amber} size={17} />}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: THEME.colors.text, fontWeight: '800' }}>{activity.title}</Text>
                  <Text style={{ color: THEME.colors.faint, marginTop: 2 }}>
                    {activity.care_profile_name} | {activity.type} | {new Date(activity.date).toLocaleDateString()}
                  </Text>
                </View>
              </View>
            )) : (
              <Text style={{ color: THEME.colors.muted }}>No recent family activity yet.</Text>
            )}
          </View>
        </View>
      )}

      <Text style={{ color: THEME.colors.text, fontSize: 18, fontWeight: '900', marginTop: 26, marginBottom: 10 }}>
        {editingProfile ? `Edit ${editingProfile.full_name}` : 'Add Family Profile'}
      </Text>
      <View style={{
        borderWidth: 1,
        borderColor: THEME.colors.border,
        borderRadius: 8,
        backgroundColor: THEME.colors.surface,
        padding: 14,
        gap: 12
      }}>
        {!editingProfile && !gate.allowed && (
          <Text style={{ color: THEME.colors.amber, lineHeight: 21 }}>{gate.reason}</Text>
        )}

        <TextInput
          placeholder="Full name"
          placeholderTextColor={THEME.colors.faint}
          value={form.full_name}
          onChangeText={(full_name) => setForm((current) => ({ ...current, full_name }))}
          style={inputStyle}
        />

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(editingProfile?.kind === 'self' ? [{ id: 'self', label: 'Self' }] : RELATIONSHIP_OPTIONS).map((option) => (
            <Pressable
              key={option.id}
              disabled={editingProfile?.kind === 'self'}
              onPress={() => setForm((current) => ({ ...current, relationship: option.id as Relationship }))}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 10,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: form.relationship === option.id ? THEME.colors.teal : THEME.colors.border,
                backgroundColor: form.relationship === option.id ? 'rgba(0, 212, 170, 0.10)' : THEME.colors.elevated
              }}
            >
              <Text style={{ color: form.relationship === option.id ? THEME.colors.teal : THEME.colors.muted, fontWeight: '800' }}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TextInput
            placeholder="Date of birth"
            placeholderTextColor={THEME.colors.faint}
            value={form.date_of_birth ?? ''}
            onChangeText={(date_of_birth) => setForm((current) => ({ ...current, date_of_birth }))}
            style={[inputStyle, { flex: 1 }]}
          />
          <TextInput
            placeholder="Gender"
            placeholderTextColor={THEME.colors.faint}
            value={form.gender ?? ''}
            onChangeText={(gender) => setForm((current) => ({ ...current, gender }))}
            style={[inputStyle, { flex: 1 }]}
          />
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {BLOOD_TYPE_OPTIONS.map((bloodType) => (
            <Pressable
              key={bloodType}
              onPress={() => setForm((current) => ({ ...current, blood_type: bloodType as BloodType }))}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 10,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: form.blood_type === bloodType ? THEME.colors.teal : THEME.colors.border,
                backgroundColor: form.blood_type === bloodType ? 'rgba(0, 212, 170, 0.10)' : THEME.colors.elevated
              }}
            >
              <Text style={{ color: form.blood_type === bloodType ? THEME.colors.teal : THEME.colors.muted, fontWeight: '800' }}>
                {bloodType}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          placeholder="Allergies, comma separated"
          placeholderTextColor={THEME.colors.faint}
          value={allergiesText}
          onChangeText={setAllergiesText}
          style={inputStyle}
        />
        <TextInput
          placeholder="Chronic conditions, comma separated"
          placeholderTextColor={THEME.colors.faint}
          value={conditionsText}
          onChangeText={setConditionsText}
          style={inputStyle}
        />
        <TextInput
          placeholder="Emergency contact name"
          placeholderTextColor={THEME.colors.faint}
          value={form.emergency_contact_name ?? ''}
          onChangeText={(emergency_contact_name) => setForm((current) => ({ ...current, emergency_contact_name }))}
          style={inputStyle}
        />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TextInput
            placeholder="Emergency phone"
            placeholderTextColor={THEME.colors.faint}
            value={form.emergency_contact_phone ?? ''}
            onChangeText={(emergency_contact_phone) => setForm((current) => ({ ...current, emergency_contact_phone }))}
            keyboardType="phone-pad"
            style={[inputStyle, { flex: 1 }]}
          />
          <TextInput
            placeholder="Relation"
            placeholderTextColor={THEME.colors.faint}
            value={form.emergency_contact_relation ?? ''}
            onChangeText={(emergency_contact_relation) => setForm((current) => ({ ...current, emergency_contact_relation }))}
            style={[inputStyle, { flex: 1 }]}
          />
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable
            disabled={saveMutation.isPending || (!editingProfile && !gate.allowed)}
            onPress={() => saveMutation.mutate()}
            style={{
              flex: 1,
              minHeight: 48,
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: (!editingProfile && !gate.allowed) ? THEME.colors.border : THEME.colors.teal,
              flexDirection: 'row',
              gap: 8
            }}
          >
            {saveMutation.isPending ? <ActivityIndicator color={THEME.colors.bg} /> : <UserPlus color={THEME.colors.bg} size={18} />}
            <Text style={{ color: THEME.colors.bg, fontWeight: '900' }}>{editingProfile ? 'Save Profile' : 'Add Profile'}</Text>
          </Pressable>
          {editingProfile && (
            <Pressable onPress={resetForm} style={{
              minHeight: 48,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: THEME.colors.border,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 16
            }}>
              <Text style={{ color: THEME.colors.muted, fontWeight: '900' }}>Cancel</Text>
            </Pressable>
          )}
        </View>

        {editingProfile?.kind === 'family' && (
          <Pressable
            disabled={deactivateMutation.isPending}
            onPress={() => {
              Alert.alert('Deactivate care profile?', `${editingProfile.full_name} will stop appearing in active family views. Existing records stay saved.`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Deactivate', style: 'destructive', onPress: () => deactivateMutation.mutate(editingProfile.id) }
              ]);
            }}
            style={{ alignSelf: 'flex-start', paddingVertical: 8 }}
          >
            <Text style={{ color: THEME.colors.red, fontWeight: '900' }}>Deactivate profile</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
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
