import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import { addDays, addHours } from 'date-fns';
import { SUBSCRIPTION_LIMITS } from '@/lib/constants';
import { DataScopeSelection, getScopedCareProfileIds } from '@/lib/dataScopes';
import { isProProfile } from '@/lib/subscription';
import { supabase } from '@/lib/supabase';
import { dataPacketService } from '@/services/data-packet.service';
import type {
  CareProfile,
  EmergencyProfileScope,
  Profile,
  PublicHealthPacket,
  ShareLinkRecord
} from '@/types';

const shareLinkFields = 'id, user_id, data_packet_id, token, label, expires_at, revoked_at, access_count, created_at';
const emergencyScopeFields = 'care_profile_id, user_id, data_packet_id, token, enabled, created_at, updated_at';

function newToken(prefix: 'share' | 'emergency') {
  return `${prefix}_${Crypto.randomUUID().replace(/-/g, '')}`;
}

function publicBaseUrl() {
  return process.env.EXPO_PUBLIC_APP_PUBLIC_URL?.replace(/\/$/, '') || null;
}

export function buildResponderUrl(token: string) {
  const base = publicBaseUrl();
  if (base) return `${base}/respond/${token}`;
  return Linking.createURL(`/respond/${token}`);
}

function getShareExpiry(profile: Profile | null) {
  return isProProfile(profile) ? addDays(new Date(), 30).toISOString() : addHours(new Date(), 24).toISOString();
}

function isFamilyScope(scope: DataScopeSelection, careProfiles: CareProfile[]) {
  const selected = new Set(getScopedCareProfileIds(scope));
  const selectedProfiles = careProfiles.filter((careProfile) => selected.has(careProfile.id));
  return selectedProfiles.some((careProfile) => careProfile.kind === 'family') || selectedProfiles.length > 1;
}

export const sharingService = {
  buildResponderUrl,

  async getActiveShareLinks(userId: string): Promise<ShareLinkRecord[]> {
    const { data, error } = await supabase
      .from('share_links')
      .select(shareLinkFields)
      .eq('user_id', userId)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as ShareLinkRecord[];
  },

  async getEmergencyScopes(userId: string): Promise<EmergencyProfileScope[]> {
    const { data, error } = await supabase
      .from('emergency_profile_scopes')
      .select(emergencyScopeFields)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as EmergencyProfileScope[];
  },

  async createShareLink(
    userId: string,
    profile: Profile | null,
    careProfiles: CareProfile[],
    scope: DataScopeSelection,
    activeShareLinkCount: number,
    label: string
  ): Promise<ShareLinkRecord> {
    const pro = isProProfile(profile);
    const limit = pro ? SUBSCRIPTION_LIMITS.proActiveShareLinks : SUBSCRIPTION_LIMITS.freeActiveShareLinks;

    if (activeShareLinkCount >= limit) {
      throw new Error(pro
        ? `Pro Family allows ${SUBSCRIPTION_LIMITS.proActiveShareLinks} active share links. Revoke an old link first.`
        : 'Free includes one short-lived active share link. Revoke it or wait for it to expire.');
    }

    if (!pro && isFamilyScope(scope, careProfiles)) {
      throw new Error('Family share links require Pro Family.');
    }

    if (!pro && scope.includeAttachments) {
      throw new Error('Attachment share links require Pro Family.');
    }

    const dataPacket = await dataPacketService.saveDraft(userId, { ...scope, purpose: 'share_link' });
    const { data, error } = await supabase
      .from('share_links')
      .insert({
        user_id: userId,
        data_packet_id: dataPacket.id,
        token: newToken('share'),
        label: label.trim() || 'Doctor share link',
        expires_at: scope.expiresAt || getShareExpiry(profile)
      })
      .select(shareLinkFields)
      .single();

    if (error) throw error;
    return data as ShareLinkRecord;
  },

  async revokeShareLink(userId: string, shareLinkId: string) {
    const { error } = await supabase
      .from('share_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', shareLinkId)
      .eq('user_id', userId);

    if (error) throw error;
  },

  async configureEmergencyScope(
    userId: string,
    careProfileId: string,
    scope: DataScopeSelection
  ): Promise<EmergencyProfileScope> {
    const token = newToken('emergency');
    const dataPacket = await dataPacketService.saveDraft(userId, {
      ...scope,
      purpose: 'emergency_id',
      careProfileIds: [careProfileId],
      includeAttachments: false
    });

    const { data, error } = await supabase
      .from('emergency_profile_scopes')
      .upsert({
        user_id: userId,
        care_profile_id: careProfileId,
        data_packet_id: dataPacket.id,
        token,
        enabled: true,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'care_profile_id'
      })
      .select(emergencyScopeFields)
      .single();

    if (error) throw error;

    await supabase
      .from('care_profiles')
      .update({
        emergency_id_enabled: true,
        emergency_id_token: token
      })
      .eq('id', careProfileId)
      .eq('owner_user_id', userId);

    return data as EmergencyProfileScope;
  },

  async disableEmergencyScope(userId: string, careProfileId: string) {
    const { error } = await supabase
      .from('emergency_profile_scopes')
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq('care_profile_id', careProfileId)
      .eq('user_id', userId);

    if (error) throw error;

    await supabase
      .from('care_profiles')
      .update({ emergency_id_enabled: false })
      .eq('id', careProfileId)
      .eq('owner_user_id', userId);
  },

  async getPublicHealthPacket(token: string): Promise<PublicHealthPacket> {
    const { data, error } = await supabase.rpc('get_public_health_packet', { p_token: token });
    if (error) throw error;
    return data as PublicHealthPacket;
  }
};
