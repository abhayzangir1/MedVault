import { useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Link } from 'expo-router';
import { Mail, LockKeyhole, Globe } from 'lucide-react-native';
import { z } from 'zod';
import { authService } from '@/services/auth.service';
import { THEME } from '@/lib/constants';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.')
});

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  const submit = async () => {
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      Alert.alert('Check your details', parsed.error.issues[0]?.message ?? 'Invalid login details.');
      return;
    }

    setIsSubmitting(true);
    try {
      await authService.signIn(parsed.data.email, parsed.data.password);
    } catch (error) {
      Alert.alert('Login failed', error instanceof Error ? error.message : 'Unable to sign in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitGoogle = async () => {
    setIsGoogleSubmitting(true);
    try {
      await authService.signInWithGoogle();
    } catch (error) {
      Alert.alert('Google login failed', error instanceof Error ? error.message : 'Unable to start Google sign-in.');
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: THEME.colors.bg }}
    >
      <Text style={{ color: THEME.colors.teal, fontSize: 13, fontWeight: '700', letterSpacing: 1.4 }}>
        SECURE HEALTH VAULT
      </Text>
      <Text style={{ color: THEME.colors.text, fontSize: 34, fontWeight: '800', marginTop: 8 }}>
        Welcome back
      </Text>
      <Text style={{ color: THEME.colors.muted, fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 28 }}>
        Sign in to continue managing your medical records on this Android device.
      </Text>

      <View style={{ gap: 12 }}>
        <Field icon={<Mail size={18} color={THEME.colors.faint} />} placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
        <Field icon={<LockKeyhole size={18} color={THEME.colors.faint} />} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
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
        {isSubmitting ? <ActivityIndicator color={THEME.colors.bg} /> : <Text style={{ color: THEME.colors.bg, fontSize: 16, fontWeight: '800' }}>Sign In</Text>}
      </Pressable>

      <Pressable
        onPress={submitGoogle}
        disabled={isGoogleSubmitting}
        style={{
          marginTop: 12,
          height: 52,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: THEME.colors.border,
          backgroundColor: THEME.colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 10,
          opacity: isGoogleSubmitting ? 0.7 : 1
        }}
      >
        <Globe size={18} color={THEME.colors.text} />
        <Text style={{ color: THEME.colors.text, fontSize: 15, fontWeight: '700' }}>
          Continue with Google
        </Text>
      </Pressable>

      <Text style={{ color: THEME.colors.muted, textAlign: 'center', marginTop: 22 }}>
        New to MedVault?{' '}
        <Link href="/(auth)/signup" style={{ color: THEME.colors.teal, fontWeight: '800' }}>
          Create account
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
