import { format } from 'date-fns';
import { DataScopeSelection } from '@/lib/dataScopes';
import { isProProfile } from '@/lib/subscription';
import { supabase } from '@/lib/supabase';
import { dataPacketService } from '@/services/data-packet.service';
import type {
  CareProfile,
  DataPacketCollection,
  MonthlyDigestBuildResult,
  MonthlyDigestRecord,
  Profile
} from '@/types';

const digestFields = 'id, user_id, data_packet_id, title, digest_text, ai_summary, status, month_key, created_at';

function currentMonthKey() {
  return format(new Date(), 'yyyy-MM');
}

function profileName(careProfiles: CareProfile[], careProfileId: string | null, profileId?: string | null) {
  const id = careProfileId ?? profileId ?? '';
  return careProfiles.find((careProfile) => careProfile.id === id)?.full_name ?? 'Selected profile';
}

function buildDigestText(collection: DataPacketCollection) {
  const lines: string[] = [];
  const abnormalLabs = collection.labs.filter((lab) => lab.results.some((marker) => marker.flag !== 'normal'));
  const criticalEvents = collection.timeline.filter((event) => event.is_critical);
  const activeMeds = collection.medications.filter((med) => med.status === 'active');
  const refillMeds = activeMeds.filter((med) => med.refill_date);
  const severeSymptoms = collection.symptoms.filter((symptom) => symptom.severity >= 7 && !symptom.resolved);
  const totalCost = collection.costs.reduce((sum, cost) => sum + Number(cost.amount ?? 0) - Number(cost.reimbursement_amount ?? 0), 0);

  lines.push(`Family digest for ${collection.careProfiles.length} selected care profile${collection.careProfiles.length === 1 ? '' : 's'}.`);
  lines.push(`${activeMeds.length} active medication${activeMeds.length === 1 ? '' : 's'}, ${refillMeds.length} with refill dates.`);
  lines.push(`${abnormalLabs.length} lab result${abnormalLabs.length === 1 ? '' : 's'} had abnormal or critical markers.`);
  lines.push(`${criticalEvents.length} critical timeline event${criticalEvents.length === 1 ? '' : 's'} were selected.`);
  lines.push(`${severeSymptoms.length} unresolved severe symptom${severeSymptoms.length === 1 ? '' : 's'} were selected.`);
  lines.push(`Selected out-of-pocket cost total: INR ${totalCost.toLocaleString('en-IN')}.`);

  if (abnormalLabs.length > 0) {
    lines.push('');
    lines.push('Lab attention:');
    abnormalLabs.slice(0, 5).forEach((lab) => {
      const flags = lab.results.filter((marker) => marker.flag !== 'normal').map((marker) => `${marker.marker} ${marker.flag}`);
      lines.push(`- ${profileName(collection.careProfiles, lab.care_profile_id, lab.profile_id)}: ${lab.test_name} (${flags.join(', ')})`);
    });
  }

  if (severeSymptoms.length > 0) {
    lines.push('');
    lines.push('Symptoms to review:');
    severeSymptoms.slice(0, 5).forEach((symptom) => {
      lines.push(`- ${profileName(collection.careProfiles, symptom.care_profile_id, symptom.profile_id)}: ${symptom.symptom_name}, severity ${symptom.severity}/10`);
    });
  }

  if (refillMeds.length > 0) {
    lines.push('');
    lines.push('Refill watchlist:');
    refillMeds.slice(0, 5).forEach((med) => {
      lines.push(`- ${profileName(collection.careProfiles, med.care_profile_id, med.profile_id)}: ${med.drug_name}, refill ${med.refill_date}`);
    });
  }

  lines.push('');
  lines.push('This digest is an organizational summary, not medical advice. Always consult a qualified clinician before making health decisions.');

  return lines.join('\n');
}

export const monthlyDigestService = {
  async getDigests(userId: string): Promise<MonthlyDigestRecord[]> {
    const { data, error } = await supabase
      .from('monthly_family_digests')
      .select(digestFields)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(12);

    if (error) throw error;
    return (data ?? []) as MonthlyDigestRecord[];
  },

  async buildDigest(
    userId: string,
    accountProfile: Profile | null,
    careProfiles: CareProfile[],
    scope: DataScopeSelection
  ): Promise<MonthlyDigestBuildResult> {
    if (!isProProfile(accountProfile)) {
      throw new Error('Monthly Family Digest is a Pro Family feature.');
    }
    if (scope.careProfileIds.length === 0) throw new Error('Choose at least one care profile.');
    if (scope.domains.length === 0) throw new Error('Choose at least one data domain.');

    const packetScope = {
      ...scope,
      purpose: 'monthly_digest' as const,
      includeAttachments: false
    };
    const collection = await dataPacketService.collectScopedData(userId, careProfiles, packetScope);
    const dataPacket = await dataPacketService.saveDraft(userId, packetScope);
    const monthKey = currentMonthKey();
    const title = `Family Digest ${monthKey}`;
    const digestText = buildDigestText(collection);

    const { data, error } = await supabase
      .from('monthly_family_digests')
      .insert({
        user_id: userId,
        data_packet_id: dataPacket.id,
        title,
        digest_text: digestText,
        ai_summary: null,
        status: 'ready',
        month_key: monthKey
      })
      .select(digestFields)
      .single();

    if (error) throw error;

    return {
      digest: data as MonthlyDigestRecord,
      dataPacket
    };
  }
};
