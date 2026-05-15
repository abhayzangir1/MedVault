import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { DataScopeSelection } from '@/lib/dataScopes';
import { isProProfile } from '@/lib/subscription';
import { dataPacketService } from '@/services/data-packet.service';
import type { CareProfile, DataPacketCollection, ExportBuildResult, Profile } from '@/types';

function escapeHtml(value: string | null | undefined) {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 80);
}

function recordCount(collection: DataPacketCollection) {
  return collection.timeline.length +
    collection.medications.length +
    collection.labs.length +
    collection.documents.length +
    collection.symptoms.length +
    collection.costs.length +
    collection.careProfiles.length;
}

function renderRows(title: string, rows: Array<Record<string, unknown>>, label: (row: Record<string, unknown>) => string) {
  return `
    <section>
      <h2>${escapeHtml(title)} (${rows.length})</h2>
      ${rows.length === 0 ? '<p class="muted">No selected records.</p>' : `<ul>${rows.map((row) => `<li>${escapeHtml(label(row))}</li>`).join('')}</ul>`}
    </section>
  `;
}

function buildExportHtml(collection: DataPacketCollection, scope: DataScopeSelection) {
  const generatedAt = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  const profileNames = collection.careProfiles.map((profile) => profile.full_name).join(', ');
  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111827; padding: 28px; }
      h1 { font-size: 28px; margin: 0 0 8px; }
      h2 { font-size: 18px; margin: 22px 0 8px; border-bottom: 1px solid #d1d5db; padding-bottom: 6px; }
      .meta, .muted { color: #4b5563; line-height: 1.5; }
      .notice { background: #ecfdf5; border: 1px solid #99f6e4; padding: 12px; border-radius: 8px; margin: 16px 0; }
      li { margin: 8px 0; line-height: 1.45; }
      footer { margin-top: 28px; color: #6b7280; font-size: 12px; }
    </style>
  </head>
  <body>
    <h1>MedVault Export Summary</h1>
    <div class="meta">
      Generated: ${escapeHtml(generatedAt)}<br/>
      Profiles: ${escapeHtml(profileNames || 'None selected')}<br/>
      Date range: ${escapeHtml(scope.dateRange)}<br/>
      Critical only: ${scope.includeCriticalOnly ? 'Yes' : 'No'} | Attachments scoped: ${scope.includeAttachments ? 'Yes' : 'No'}
    </div>
    <div class="notice">This export includes only the data selected by the user in Data Packet Builder. The JSON file is the machine-readable source of truth.</div>
    ${renderRows('Care Profiles', collection.careProfiles as unknown as Array<Record<string, unknown>>, (row) => `${row.full_name ?? 'Profile'} - ${row.relationship ?? ''}`)}
    ${renderRows('Timeline', collection.timeline as unknown as Array<Record<string, unknown>>, (row) => `${row.event_date ?? ''} - ${row.title ?? ''}`)}
    ${renderRows('Medications', collection.medications as unknown as Array<Record<string, unknown>>, (row) => `${row.drug_name ?? ''} - ${row.dosage ?? ''} - ${row.frequency ?? ''}`)}
    ${renderRows('Labs', collection.labs as unknown as Array<Record<string, unknown>>, (row) => `${row.test_date ?? ''} - ${row.test_name ?? ''}`)}
    ${renderRows('Documents', collection.documents as unknown as Array<Record<string, unknown>>, (row) => `${row.file_name ?? ''} - ${row.document_category ?? ''}`)}
    ${renderRows('Symptoms', collection.symptoms as unknown as Array<Record<string, unknown>>, (row) => `${row.onset_date ?? ''} - ${row.symptom_name ?? ''} severity ${row.severity ?? ''}`)}
    ${renderRows('Costs', collection.costs as unknown as Array<Record<string, unknown>>, (row) => `${row.cost_date ?? ''} - ${row.description ?? row.category ?? ''} - ${row.amount ?? ''}`)}
    <footer>MedVault export. Keep this file private.</footer>
  </body>
</html>`;
}

export const exportService = {
  async buildExport(
    userId: string,
    accountProfile: Profile | null,
    careProfiles: CareProfile[],
    scope: DataScopeSelection
  ): Promise<ExportBuildResult> {
    const selectedCareProfiles = careProfiles.filter((profile) => scope.careProfileIds.includes(profile.id));
    const includesFamily = selectedCareProfiles.some((profile) => profile.kind === 'family') || selectedCareProfiles.length > 1;

    if (selectedCareProfiles.length === 0) throw new Error('Choose at least one care profile.');
    if (scope.domains.length === 0) throw new Error('Choose at least one data domain.');
    if (!isProProfile(accountProfile) && includesFamily) {
      throw new Error('Family bundle export requires Pro Family. Basic self export stays free.');
    }
    if (!isProProfile(accountProfile) && scope.includeAttachments) {
      throw new Error('Attachment export requires Pro Family.');
    }

    const collection = await dataPacketService.collectScopedData(userId, careProfiles, { ...scope, purpose: 'export' });
    const dataPacket = await dataPacketService.saveDraft(userId, { ...scope, purpose: 'export' });
    const fileBaseName = safeFileName(`medvault-export-${new Date().toISOString().slice(0, 10)}-${dataPacket.id.slice(0, 8)}`);
    const payload = {
      export_version: '1.0',
      generated_at: new Date().toISOString(),
      data_packet_id: dataPacket.id,
      scope: {
        purpose: dataPacket.purpose,
        care_profile_ids: dataPacket.care_profile_ids,
        domains: dataPacket.domains,
        date_range: dataPacket.date_range,
        custom_start_date: dataPacket.custom_start_date,
        custom_end_date: dataPacket.custom_end_date,
        include_attachments: dataPacket.include_attachments,
        include_critical_only: dataPacket.include_critical_only
      },
      data: collection
    };

    const jsonFile = new File(Paths.cache, `${fileBaseName}.json`);
    jsonFile.create({ overwrite: true });
    jsonFile.write(JSON.stringify(payload, null, 2));

    const html = buildExportHtml(collection, scope);
    const pdf = await Print.printToFileAsync({ html, base64: false });
    const pdfFile = new File(Paths.cache, `${fileBaseName}.pdf`);
    const generatedPdf = new File(pdf.uri);
    generatedPdf.copy(pdfFile);

    return {
      dataPacket,
      pdfUri: pdfFile.uri,
      jsonUri: jsonFile.uri,
      fileBaseName,
      recordCount: recordCount(collection)
    };
  },

  async shareFile(uri: string, mimeType: string, dialogTitle: string) {
    const available = await Sharing.isAvailableAsync();
    if (!available) throw new Error('Sharing is not available on this device.');
    await Sharing.shareAsync(uri, { mimeType, dialogTitle });
  }
};
