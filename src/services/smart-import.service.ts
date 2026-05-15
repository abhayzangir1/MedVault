import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { costService } from '@/services/cost.service';
import { labService } from '@/services/lab.service';
import { medicationService } from '@/services/medication.service';
import { timelineService } from '@/services/timeline.service';
import type {
  CostCategory,
  DocumentCategory,
  EventCategory,
  HealthcareCostInput,
  HealthEventInput,
  LabMarkerInput,
  LabResultInput,
  MedicalDocument,
  MedicationInput,
  SmartImportSuggestion,
  SmartImportTargetDomain
} from '@/types';

const suggestionFields =
  'id, user_id, care_profile_id, source_document_id, target_domain, suggested_payload, confidence, status, created_record_id, created_at';

type DraftSuggestion = {
  target_domain: SmartImportTargetDomain;
  suggested_payload: Record<string, unknown>;
  confidence: number;
};

function today() {
  return format(new Date(), 'yyyy-MM-dd');
}

function firstDate(text: string) {
  const iso = text.match(/\b(20\d{2}|19\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/);
  if (iso) {
    const [, year, month, day] = iso;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const indian = text.match(/\b(0?[1-9]|[12]\d|3[01])[-/](0?[1-9]|1[0-2])[-/](20\d{2}|19\d{2})\b/);
  if (indian) {
    const [, day, month, year] = indian;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return today();
}

function titleFromCategory(category: DocumentCategory | null) {
  if (category === 'lab_report') return { title: 'Lab report reviewed', category: 'lab_test' as EventCategory };
  if (category === 'prescription') return { title: 'Prescription reviewed', category: 'medication' as EventCategory };
  if (category === 'discharge_summary') return { title: 'Hospital discharge summary', category: 'hospitalization' as EventCategory };
  if (category === 'imaging') return { title: 'Imaging report reviewed', category: 'imaging' as EventCategory };
  if (category === 'insurance') return { title: 'Insurance document reviewed', category: 'other' as EventCategory };
  return { title: 'Medical document reviewed', category: 'other' as EventCategory };
}

function parseMedicationSuggestions(text: string): DraftSuggestion[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const candidates = lines.filter((line) => /\b(tab|tablet|cap|capsule|syrup|inj|injection|mg|mcg|ml)\b/i.test(line));

  return candidates.slice(0, 5).map((line) => {
    const dosage = line.match(/\b\d+(\.\d+)?\s?(mg|mcg|g|ml|iu)\b/i)?.[0] ?? '';
    const frequency = line.match(/\b(od|bd|tds|tid|qid|daily|night|morning|evening|once|twice)\b/i)?.[0] ?? 'As prescribed';
    const withoutPrefix = line.replace(/^(tab|tablet|cap|capsule|syrup|inj|injection)\.?\s*/i, '');
    const name = withoutPrefix.replace(dosage, '').replace(frequency, '').trim().split(/\s{2,}|-/)[0]?.trim() || withoutPrefix.slice(0, 40);

    return {
      target_domain: 'medications',
      confidence: dosage ? 76 : 58,
      suggested_payload: {
        drug_name: name,
        dosage: dosage || 'Verify dosage',
        frequency,
        notes: `Imported from OCR line: ${line}`,
        status: 'active'
      }
    };
  });
}

function parseLabSuggestion(text: string, document: MedicalDocument): DraftSuggestion[] {
  const markerLines = text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /\d/.test(line) && /\b(mg\/dl|g\/dl|mmol\/l|iu\/l|u\/l|%|x10|cells|ng\/ml)\b/i.test(line));

  const markers: LabMarkerInput[] = markerLines.slice(0, 8).map((line) => {
    const value = line.match(/-?\d+(\.\d+)?/)?.[0] ?? '';
    const unit = line.match(/\b(mg\/dl|g\/dl|mmol\/l|iu\/l|u\/l|%|ng\/ml|pg\/ml)\b/i)?.[0] ?? '';
    const marker = line.split(value)[0]?.replace(/[:\-]/g, '').trim() || 'Marker';
    const numbers = [...line.matchAll(/-?\d+(\.\d+)?/g)].map((match) => match[0]);

    return {
      marker,
      value,
      unit,
      reference_low: numbers[1] ?? '',
      reference_high: numbers[2] ?? ''
    };
  }).filter((marker) => marker.marker !== 'Marker' && marker.value);

  if (markers.length === 0 && document.document_category !== 'lab_report') return [];

  return [{
    target_domain: 'labs',
    confidence: markers.length > 0 ? 72 : 45,
    suggested_payload: {
      test_name: document.document_category === 'lab_report' ? document.file_name.replace(/\.[^.]+$/, '') : 'Lab result',
      test_date: firstDate(text),
      markers
    }
  }];
}

function parseCostSuggestion(text: string, document: MedicalDocument): DraftSuggestion[] {
  const amountMatch = text.match(/(?:₹|rs\.?|inr)\s?([0-9][0-9,]*(?:\.\d{1,2})?)/i) ?? text.match(/\b(total|amount|paid|bill)\D+([0-9][0-9,]*(?:\.\d{1,2})?)/i);
  const amount = amountMatch?.[1] ?? amountMatch?.[2];
  if (!amount && document.document_category !== 'insurance') return [];

  return [{
    target_domain: 'costs',
    confidence: amount ? 70 : 42,
    suggested_payload: {
      amount: amount?.replace(/,/g, '') ?? '0',
      cost_date: firstDate(text),
      category: document.document_category === 'lab_report' ? 'lab' : document.document_category === 'imaging' ? 'imaging' : 'other',
      description: `Imported cost from ${document.file_name}`,
      provider_name: '',
      reimbursement_status: 'not_applicable',
      reimbursement_amount: ''
    }
  }];
}

function buildTimelineSuggestion(text: string, document: MedicalDocument): DraftSuggestion {
  const categoryTitle = titleFromCategory(document.document_category);
  return {
    target_domain: 'timeline',
    confidence: 64,
    suggested_payload: {
      title: categoryTitle.title,
      category: categoryTitle.category,
      event_date: firstDate(text),
      description: `Imported from ${document.file_name}`,
      is_critical: document.document_category === 'discharge_summary'
    }
  };
}

function buildDocumentSuggestion(document: MedicalDocument): DraftSuggestion {
  return {
    target_domain: 'documents',
    confidence: document.ocr_confidence ?? 50,
    suggested_payload: {
      file_name: document.file_name,
      document_category: document.document_category ?? 'other',
      is_handwritten: document.is_handwritten,
      ocr_confidence: document.ocr_confidence
    }
  };
}

function buildDraftSuggestions(document: MedicalDocument): DraftSuggestion[] {
  const text = document.ocr_text?.trim();
  if (!text) throw new Error('Scan this document with OCR before generating Smart Import suggestions.');

  const drafts = [
    buildTimelineSuggestion(text, document),
    buildDocumentSuggestion(document),
    ...parseMedicationSuggestions(text),
    ...parseLabSuggestion(text, document),
    ...parseCostSuggestion(text, document)
  ];

  return drafts.slice(0, 12);
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : false;
}

export const smartImportService = {
  async getPendingSuggestions(userId: string, careProfileId: string | null): Promise<SmartImportSuggestion[]> {
    let query = supabase
      .from('smart_import_suggestions')
      .select(suggestionFields)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (careProfileId) query = query.eq('care_profile_id', careProfileId);

    const { data, error } = await query;
    if (error) throw error;

    const suggestions = (data ?? []) as SmartImportSuggestion[];
    const documentIds = [...new Set(suggestions.map((suggestion) => suggestion.source_document_id))];
    if (documentIds.length === 0) return suggestions;

    const { data: documents, error: documentsError } = await supabase
      .from('documents')
      .select('id, user_id, care_profile_id, profile_id, file_name, file_url, storage_path, file_type, file_size, document_category, ocr_text, ocr_confidence, is_handwritten, deleted_at, created_at')
      .in('id', documentIds);

    if (documentsError) throw documentsError;
    const documentsById = new Map((documents ?? []).map((document) => [document.id, document as MedicalDocument]));

    return suggestions.map((suggestion) => ({
      ...suggestion,
      source_document: documentsById.get(suggestion.source_document_id) ?? null
    }));
  },

  async generateSuggestions(userId: string, document: MedicalDocument): Promise<SmartImportSuggestion[]> {
    const { data: existing, error: existingError } = await supabase
      .from('smart_import_suggestions')
      .select(suggestionFields)
      .eq('user_id', userId)
      .eq('source_document_id', document.id)
      .eq('status', 'pending');

    if (existingError) throw existingError;
    if ((existing ?? []).length > 0) return existing as SmartImportSuggestion[];

    const drafts = buildDraftSuggestions(document);
    const { data, error } = await supabase
      .from('smart_import_suggestions')
      .insert(drafts.map((draft) => ({
        user_id: userId,
        care_profile_id: document.care_profile_id ?? document.profile_id ?? userId,
        source_document_id: document.id,
        target_domain: draft.target_domain,
        suggested_payload: draft.suggested_payload,
        confidence: draft.confidence,
        status: 'pending'
      })))
      .select(suggestionFields);

    if (error) throw error;
    return (data ?? []) as SmartImportSuggestion[];
  },

  async approveSuggestion(userId: string, suggestion: SmartImportSuggestion): Promise<string | null> {
    const careProfileId = suggestion.care_profile_id ?? userId;
    const payload = suggestion.suggested_payload;
    let createdRecordId: string | null = null;

    if (suggestion.target_domain === 'timeline') {
      const input: HealthEventInput = {
        title: asString(payload.title, 'Imported medical event'),
        category: asString(payload.category, 'other') as EventCategory,
        event_date: asString(payload.event_date, today()),
        description: asString(payload.description, ''),
        is_critical: asBoolean(payload.is_critical),
        source_document_id: suggestion.source_document_id
      };
      const created = await timelineService.createEvent(userId, careProfileId, input);
      createdRecordId = created.id;
    }

    if (suggestion.target_domain === 'medications') {
      const input: MedicationInput = {
        drug_name: asString(payload.drug_name, 'Medication'),
        dosage: asString(payload.dosage, 'Verify dosage'),
        frequency: asString(payload.frequency, 'As prescribed'),
        notes: asString(payload.notes, ''),
        status: 'active',
        source_document_id: suggestion.source_document_id
      };
      const created = await medicationService.createMedication(userId, careProfileId, input);
      createdRecordId = created.id;
    }

    if (suggestion.target_domain === 'labs') {
      const input: LabResultInput = {
        test_name: asString(payload.test_name, 'Lab result'),
        test_date: asString(payload.test_date, today()),
        markers: Array.isArray(payload.markers) ? payload.markers as LabMarkerInput[] : [],
        source_document_id: suggestion.source_document_id
      };
      const created = await labService.createLabResult(userId, careProfileId, input);
      createdRecordId = created.id;
    }

    if (suggestion.target_domain === 'costs') {
      const input: HealthcareCostInput = {
        amount: asString(payload.amount, '0'),
        cost_date: asString(payload.cost_date, today()),
        category: asString(payload.category, 'other') as CostCategory,
        description: asString(payload.description, ''),
        provider_name: asString(payload.provider_name, ''),
        reimbursement_status: 'not_applicable',
        reimbursement_amount: asString(payload.reimbursement_amount, ''),
        source_document_id: suggestion.source_document_id
      };
      const created = await costService.createCost(userId, careProfileId, input);
      createdRecordId = created.id;
    }

    if (suggestion.target_domain === 'documents') {
      createdRecordId = suggestion.source_document_id;
    }

    const { error } = await supabase
      .from('smart_import_suggestions')
      .update({
        status: 'approved',
        created_record_id: createdRecordId
      })
      .eq('id', suggestion.id)
      .eq('user_id', userId);

    if (error) throw error;
    return createdRecordId;
  },

  async rejectSuggestion(userId: string, suggestionId: string) {
    const { error } = await supabase
      .from('smart_import_suggestions')
      .update({ status: 'rejected' })
      .eq('id', suggestionId)
      .eq('user_id', userId);

    if (error) throw error;
  }
};
