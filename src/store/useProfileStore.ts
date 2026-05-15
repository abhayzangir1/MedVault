import { create } from 'zustand';
import type { CareProfile, FamilyProfile, Profile } from '@/types';

interface ProfileState {
  profile: Profile | null;
  activeCareProfileId: string | null;
  activeProfileId: string | null;
  careProfiles: CareProfile[];
  familyMembers: FamilyProfile[];
  setProfile: (profile: Profile | null) => void;
  setActiveCareProfileId: (activeCareProfileId: string | null) => void;
  setActiveProfileId: (activeProfileId: string | null) => void;
  setCareProfiles: (careProfiles: CareProfile[]) => void;
  setFamilyMembers: (familyMembers: FamilyProfile[]) => void;
  resetProfileState: () => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  profile: null,
  activeCareProfileId: null,
  activeProfileId: null,
  careProfiles: [],
  familyMembers: [],
  setProfile: (profile) => set({ profile }),
  setActiveCareProfileId: (activeCareProfileId) => set({ activeCareProfileId, activeProfileId: activeCareProfileId }),
  setActiveProfileId: (activeProfileId) => set({ activeProfileId, activeCareProfileId: activeProfileId }),
  setCareProfiles: (careProfiles) => set((state) => {
    const selfProfile = careProfiles.find((careProfile) => careProfile.kind === 'self') ?? careProfiles[0] ?? null;
    const currentProfileStillActive = careProfiles.some((careProfile) => careProfile.id === state.activeCareProfileId);
    const activeCareProfileId = currentProfileStillActive
      ? state.activeCareProfileId
      : selfProfile?.id ?? null;

    return {
      careProfiles,
      familyMembers: careProfiles.filter((careProfile) => careProfile.kind === 'family'),
      activeCareProfileId,
      activeProfileId: activeCareProfileId
    };
  }),
  setFamilyMembers: (familyMembers) => set({ familyMembers }),
  resetProfileState: () => set({
    profile: null,
    activeCareProfileId: null,
    activeProfileId: null,
    careProfiles: [],
    familyMembers: []
  })
}));
