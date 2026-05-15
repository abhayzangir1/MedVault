import { createContext, useContext, useEffect, useMemo } from 'react';
import type { PropsWithChildren } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';
import { careProfileService } from '@/services/care-profile.service';
import { profileService } from '@/services/profile.service';
import { useAuthStore } from '@/store/useAuthStore';
import { useProfileStore } from '@/store/useProfileStore';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const { session, user, isLoading, setSession, setIsLoading } = useAuthStore();
  const { profile, setCareProfiles, setProfile, resetProfileState } = useProfileStore();

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) throw error;
        if (isMounted) setSession(data.session);
      })
      .catch(() => {
        if (isMounted) setSession(null);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) resetProfileState();
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, [resetProfileState, setIsLoading, setSession]);

  useQuery({
    queryKey: user?.id ? queryKeys.profile(user.id) : ['profile', 'anonymous'],
    queryFn: async () => {
      if (!user?.id) return null;
      const profile = await profileService.getProfile(user.id);
      setProfile(profile);
      return profile;
    },
    enabled: !!user?.id
  });

  useQuery({
    queryKey: user?.id ? queryKeys.careProfiles(user.id) : ['care-profiles', 'anonymous'],
    queryFn: async () => {
      if (!user?.id || !profile) return [];
      const careProfiles = await careProfileService.getCareProfiles(user.id, profile);
      setCareProfiles(careProfiles);
      return careProfiles;
    },
    enabled: !!user?.id && !!profile
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      isLoading,
      isAuthenticated: !!session
    }),
    [isLoading, session, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider.');
  return value;
}
