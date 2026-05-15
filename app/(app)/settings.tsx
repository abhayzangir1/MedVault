import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, LogOut, Mail, Shield, Trash2, UserRound } from 'lucide-react-native';
import { UpgradeBanner } from '@/components/UpgradeBanner';
import { BLOOD_TYPE_OPTIONS, SUBSCRIPTION_LIMITS, THEME } from '@/lib/constants';
import { queryKeys } from '@/lib/queryKeys';
import { getBillingRegion, getProPriceLabel, isProProfile } from '@/lib/subscription';
import { authService } from '@/services/auth.service';
import { profileService } from '@/services/profile.service';
import { useAuth } from '@/contexts/AuthContext';
import { useProfileStore } from '@/store/useProfileStore';
import type { BloodType, ProfileSettingsInput } from '@/types';

const privacyUrl = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL || 'https://example.com/medvault/privacy';
const termsUrl = process.env.EXPO_PUBLIC_TERMS_URL || 'https://example.com/medvault/terms';
const supportEmail = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || 'support@example.com';

function csvToArray(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function arrayToCsv(value?: string[] | null) {
  return value?.join(', ') ?? '';
}

export default function SettingsScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { profile, setProfile, resetProfileState } = useProfileStore();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [fullName, setFullName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [bloodType, setBloodType] = useState<BloodType>('Unknown');
  const [gender, setGender] = useState('');
  const [country, setCountry] = useState('IN');
  const [allergies, setAllergies] = useState('');
  const [conditions, setConditions] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [emergencyRelation, setEmergencyRelation] = useState('');
  const [deleteReason, setDeleteReason] = useState('');

  const region = profile?.billing_region ?? getBillingRegion(profile?.country);
  const isPro = isProProfile(profile);
  const userId = user?.id ?? '';

  useEffect(() => {
    setFullName(profile?.full_name ?? user?.user_metadata?.full_name ?? '');
    setDateOfBirth(profile?.date_of_birth ?? '');
    setBloodType(profile?.blood_type ?? 'Unknown');
    setGender(profile?.gender ?? '');
    setCountry(profile?.country ?? 'IN');
    setAllergies(arrayToCsv(profile?.allergies));
    setConditions(arrayToCsv(profile?.chronic_conditions));
    setEmergencyName(profile?.emergency_contact_name ?? '');
    setEmergencyPhone(profile?.emergency_contact_phone ?? '');
    setEmergencyRelation(profile?.emergency_contact_relation ?? '');
  }, [profile, user?.user_metadata?.full_name]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('Sign in again to update settings.');
      const input: ProfileSettingsInput = {
        full_name: fullName,
        date_of_birth: dateOfBirth,
        blood_type: bloodType,
        gender,
        country,
        allergies: csvToArray(allergies),
        chronic_conditions: csvToArray(conditions),
        emergency_contact_name: emergencyName,
        emergency_contact_phone: emergencyPhone,
        emergency_contact_relation: emergencyRelation
      };
      return profileService.updateProfileSettings(userId, input);
    },
    onSuccess: async (nextProfile) => {
      setProfile(nextProfile);
      await queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.careProfiles(userId) });
      Alert.alert('Settings saved', 'Your profile and emergency contact details were updated.');
    },
    onError: showError
  });

  const deletionMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('Sign in again to delete your account.');
      await profileService.deleteAccount(deleteReason);
    },
    onSuccess: async () => {
      setDeleteReason('');
      resetProfileState();
      await authService.signOut().catch(() => undefined);
      Alert.alert(
        'Account deleted',
        'Your account deletion was completed. Local session data has been cleared.'
      );
    },
    onError: showError
  });

  const signOut = async () => {
    setIsSigningOut(true);
    try {
      await authService.signOut();
      resetProfileState();
    } catch (error) {
      Alert.alert('Sign out failed', error instanceof Error ? error.message : 'Unable to sign out.');
    } finally {
      setIsSigningOut(false);
    }
  };

  const confirmDeleteRequest = () => {
    Alert.alert(
      'Delete account permanently?',
      'This removes your auth account, health records, family profiles, documents, photos, packets, share links, and deletion request records. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete permanently', style: 'destructive', onPress: () => deletionMutation.mutate() }
      ]
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: THEME.colors.bg }}
      contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 120 }}
    >
      <Text style={{ color: THEME.colors.text, fontSize: 30, fontWeight: '900' }}>Settings</Text>
      <Text style={{ color: THEME.colors.muted, lineHeight: 22, marginTop: 8 }}>
        Account, safety, subscription, and compliance controls for the native Android app.
      </Text>

      <View style={{ borderWidth: 1, borderColor: THEME.colors.border, backgroundColor: THEME.colors.surface, borderRadius: 8, padding: 16, marginTop: 20, gap: 14 }}>
        <Row icon={<UserRound color={THEME.colors.teal} size={19} />} label="Name" value={profile?.full_name ?? user?.user_metadata?.full_name ?? 'Not set'} />
        <Row icon={<Mail color={THEME.colors.blue} size={19} />} label="Email" value={user?.email ?? 'Not signed in'} />
        <Row icon={<Shield color={THEME.colors.amber} size={19} />} label="Plan" value={`${(profile?.plan ?? 'free').toUpperCase()} | ${profile?.subscription_status ?? 'inactive'}`} />
      </View>

      {!isPro ? (
        <View style={{ marginTop: 16 }}>
          <UpgradeBanner
            region={region}
            message={`Pro Family unlocks ${SUBSCRIPTION_LIMITS.proAdditionalCareProfiles} additional care profiles, ${SUBSCRIPTION_LIMITS.proAiOrOcrUsesPerMonth} AI/OCR uses per month, caregiver dashboard, advanced packets, share links, and digest. Google Play Billing will show ${getProPriceLabel(region)} before purchase.`}
          />
        </View>
      ) : null}

      <Section title="Profile">
        <Field label="Full name" value={fullName} onChangeText={setFullName} placeholder="Your name" />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label="Date of birth" value={dateOfBirth} onChangeText={setDateOfBirth} placeholder="YYYY-MM-DD" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Gender" value={gender} onChangeText={setGender} placeholder="Optional" />
          </View>
        </View>
        <Field label="Country code" value={country} onChangeText={setCountry} placeholder="IN" />
        <Text style={{ color: THEME.colors.faint, fontSize: 12, fontWeight: '900' }}>Blood type</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {BLOOD_TYPE_OPTIONS.map((item) => {
            const active = bloodType === item;
            return (
              <Pressable key={item} onPress={() => setBloodType(item as BloodType)} style={chipStyle(active)}>
                <Text style={chipTextStyle(active)}>{item}</Text>
              </Pressable>
            );
          })}
        </View>
        <Field label="Allergies" value={allergies} onChangeText={setAllergies} placeholder="Comma separated" />
        <Field label="Chronic conditions" value={conditions} onChangeText={setConditions} placeholder="Comma separated" />
      </Section>

      <Section title="Emergency Contact">
        <Field label="Contact name" value={emergencyName} onChangeText={setEmergencyName} placeholder="Emergency contact" />
        <Field label="Phone" value={emergencyPhone} onChangeText={setEmergencyPhone} placeholder="+91..." />
        <Field label="Relation" value={emergencyRelation} onChangeText={setEmergencyRelation} placeholder="Spouse, parent, friend" />
        <Pressable
          disabled={saveMutation.isPending}
          onPress={() => saveMutation.mutate()}
          style={{
            minHeight: 50,
            borderRadius: 8,
            backgroundColor: THEME.colors.teal,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 4
          }}
        >
          {saveMutation.isPending ? <ActivityIndicator color={THEME.colors.bg} /> : <Text style={{ color: THEME.colors.bg, fontWeight: '900' }}>Save Settings</Text>}
        </Pressable>
      </Section>

      <Section title="Legal + Safety">
        <LegalButton label="Privacy Policy" url={privacyUrl} />
        <LegalButton label="Terms and Conditions" url={termsUrl} />
        <LegalButton label="Contact Support" url={`mailto:${supportEmail}`} />
        <View style={{ borderWidth: 1, borderColor: THEME.colors.border, borderRadius: 8, backgroundColor: THEME.colors.surface, padding: 14 }}>
          <Text style={{ color: THEME.colors.text, fontWeight: '900' }}>Medical safety</Text>
          <Text style={{ color: THEME.colors.muted, lineHeight: 21, marginTop: 6 }}>
            MedVault stores user-entered records and selected AI/OCR summaries. It is not medical advice, diagnosis, treatment, or emergency service.
          </Text>
        </View>
      </Section>

      <Section title="Account Deletion">
        <TextInput
          value={deleteReason}
          onChangeText={setDeleteReason}
          placeholder="Optional reason"
          placeholderTextColor={THEME.colors.faint}
          multiline
          style={[inputStyle, { minHeight: 80, textAlignVertical: 'top', paddingTop: 12 }]}
        />
        <Pressable
          onPress={confirmDeleteRequest}
          disabled={deletionMutation.isPending}
          style={{
            minHeight: 50,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: 'rgba(239, 68, 68, 0.35)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 10
          }}
        >
          {deletionMutation.isPending ? <ActivityIndicator color={THEME.colors.red} /> : <Trash2 color={THEME.colors.red} size={18} />}
          <Text style={{ color: THEME.colors.red, fontWeight: '900' }}>Delete Account Permanently</Text>
        </Pressable>
      </Section>

      <Pressable
        onPress={signOut}
        disabled={isSigningOut}
        style={{
          marginTop: 22,
          minHeight: 52,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: 'rgba(239, 68, 68, 0.35)',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 10,
          opacity: isSigningOut ? 0.7 : 1
        }}
      >
        {isSigningOut ? <ActivityIndicator color={THEME.colors.red} /> : <LogOut color={THEME.colors.red} size={18} />}
        <Text style={{ color: THEME.colors.red, fontSize: 15, fontWeight: '900' }}>Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: 24, gap: 10 }}>
      <Text style={{ color: THEME.colors.text, fontSize: 18, fontWeight: '900' }}>{title}</Text>
      {children}
    </View>
  );
}

function Field({ label, value, onChangeText, placeholder }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={{ color: THEME.colors.faint, fontSize: 12, fontWeight: '900' }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={THEME.colors.faint}
        style={inputStyle}
      />
    </View>
  );
}

function LegalButton({ label, url }: { label: string; url: string }) {
  return (
    <Pressable
      onPress={() => Linking.openURL(url)}
      style={{
        minHeight: 46,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: THEME.colors.border,
        backgroundColor: THEME.colors.surface,
        paddingHorizontal: 14,
        alignItems: 'center',
        flexDirection: 'row',
        gap: 10
      }}
    >
      <FileText color={THEME.colors.teal} size={18} />
      <Text style={{ color: THEME.colors.text, fontWeight: '900', flex: 1 }}>{label}</Text>
      <Text style={{ color: THEME.colors.teal, fontWeight: '900' }}>OPEN</Text>
    </Pressable>
  );
}

interface RowProps {
  icon: ReactNode;
  label: string;
  value: string;
}

function Row({ icon, label, value }: RowProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={{ color: THEME.colors.faint, fontSize: 12, fontWeight: '700' }}>{label}</Text>
        <Text style={{ color: THEME.colors.text, fontSize: 15, fontWeight: '700', marginTop: 2 }}>{value}</Text>
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
  minHeight: 46,
  borderWidth: 1,
  borderColor: THEME.colors.border,
  backgroundColor: THEME.colors.surface,
  borderRadius: 8,
  paddingHorizontal: 12,
  color: THEME.colors.text
};

function showError(error: Error) {
  Alert.alert('Settings error', error.message);
}
