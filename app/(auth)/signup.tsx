import { useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Link } from 'expo-router';
import { LockKeyhole, Mail, UserRound } from 'lucide-react-native';
import { z } from 'zod';
import { authService } from '@/services/auth.service';
import { THEME } from '@/lib/constants';

const signupSchema = z.object({
  fullName: z.string().min(2, 'Enter your full name.'),
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  confirmPassword: z.string().min(8, 'Confirm your password.')
}).refine((value) => value.password === value.confirmPassword, {
  message: 'Passwords do not match.',
  path: ['confirmPassword']
});

export default function SignupScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    const parsed = signupSchema.safeParse({ fullName, email, password, confirmPassword });
    if (!parsed.success) {
      Alert.alert('Check your details', parsed.error.issues[0]?.message ?? 'Invalid signup details.');
      return;
    }

    setIsSubmitting(true);
    try {
      await authService.signUp({
        fullName: parsed.data.fullName,
        email: parsed.data.email,
        password: parsed.data.password
      });
      Alert.alert('Account created', 'If email confirmation is enabled, confirm your email before signing in.');
    } catch (error) {
      Alert.alert('Signup failed', error instanceof Error ? error.message : 'Unable to create account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: THEME.colors.bg }}
    >
      <Text style={{ color: THEME.colors.teal, fontSize: 13, fontWeight: '700', letterSpacing: 1.4 }}>
        MEDVAULT 2.0
      </Text>
      <Text style={{ color: THEME.colors.text, fontSize: 34, fontWeight: '800', marginTop: 8 }}>
        Create account
      </Text>
      <Text style={{ color: THEME.colors.muted, fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 28 }}>
        Start with your own health profile. Family and AI upgrades are gated by the Pro plan later.
      </Text>

      <View style={{ gap: 12 }}>
        <Field icon={<UserRound size={18} color={THEME.colors.faint} />} placeholder="Full name" value={fullName} onChangeText={setFullName} />
        <Field icon={<Mail size={18} color={THEME.colors.faint} />} placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
        <Field icon={<LockKeyhole size={18} color={THEME.colors.faint} />} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
        <Field icon={<LockKeyhole size={18} color={THEME.colors.faint} />} placeholder="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
      </View>

      <Pressable
        onPress={submit}
        disabled={isSubmitting}
        style={{
          marginTop: 18,
          height: 52,
          borderRadius: 8,
          backgroundColor: THEME.colors.teal,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isSubmitting ? 0.7 : 1
        }}
      >
        {isSubmitting ? <ActivityIndicator color={THEME.colors.bg} /> : <Text style={{ color: THEME.colors.bg, fontSize: 16, fontWeight: '800' }}>Create Account</Text>}
      </Pressable>

      <Text style={{ color: THEME.colors.muted, textAlign: 'center', marginTop: 22 }}>
        Already have an account?{' '}
        <Link href="/(auth)/login" style={{ color: THEME.colors.teal, fontWeight: '800' }}>
          Sign in
        </Link>
      </Text>
    </KeyboardAvoidingView>
  );
}

interface FieldProps {
  icon: ReactNode;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'email-address';
  secureTextEntry?: boolean;
}

function Field(props: FieldProps) {
  return (
    <View
      style={{
        height: 52,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: THEME.colors.border,
        backgroundColor: THEME.colors.surface,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10
      }}
    >
      {props.icon}
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={THEME.colors.faint}
        keyboardType={props.keyboardType}
        autoCapitalize="none"
        secureTextEntry={props.secureTextEntry}
        style={{ flex: 1, color: THEME.colors.text, fontSize: 15 }}
      />
    </View>
  );
}
