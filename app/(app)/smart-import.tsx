import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Brain, Check, FileSearch, ScanLine, X } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { DOCUMENT_CATEGORIES, THEME } from '@/lib/constants';
import { queryKeys } from '@/lib/queryKeys';
import { documentService } from '@/services/document.service';
import { smartImportService } from '@/services/smart-import.service';
import { useProfileStore } from '@/store/useProfileStore';
import type { MedicalDocument, SmartImportSuggestion } from '@/types';

function payloadSummary(suggestion: SmartImportSuggestion) {
  const payload = suggestion.suggested_payload;
  if (suggestion.target_domain === 'medications') {
    return `${payload.drug_name ?? 'Medication'} | ${payload.dosage ?? 'dosage'} | ${payload.frequency ?? 'frequency'}`;
  }
  if (suggestion.target_domain === 'labs') {
    const markers = Array.isArray(payload.markers) ? payload.markers.length : 0;
    return `${payload.test_name ?? 'Lab result'} | ${markers} marker${markers === 1 ? '' : 's'}`;
  }
  if (suggestion.target_domain === 'timeline') {
    return `${payload.title ?? 'Timeline event'} | ${payload.event_date ?? 'date'}`;
  }
  if (suggestion.target_domain === 'costs') {
    return `${payload.description ?? 'Cost'} | INR ${payload.amount ?? '0'}`;
  }
  return `${payload.file_name ?? 'Document metadata'} | ${payload.document_category ?? 'category'}`;
}

function domainLabel(domain: string) {
  if (domain === 'medications') return 'Medication';
  if (domain === 'labs') return 'Lab';
  if (domain === 'timeline') return 'Timeline';
  if (domain === 'costs') return 'Cost';
  return 'Document';
}

export default function SmartImportScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { activeCareProfileId, careProfiles } = useProfileStore();
  const userId = user?.id ?? '';
  const activeCareProfile = careProfiles.find((profile) => profile.id === activeCareProfileId);
  const [refreshing, setRefreshing] = useState(false);

  const documentsQuery = useQuery({
    queryKey: queryKeys.documents(userId, activeCareProfileId),
    enabled: !!userId,
    queryFn: () => documentService.getDocuments(userId, activeCareProfileId)
  });

  const suggestionsQuery = useQuery({
    queryKey: queryKeys.smartImportSuggestions(userId, activeCareProfileId),
    enabled: !!userId,
    queryFn: () => smartImportService.getPendingSuggestions(userId, activeCareProfileId)
  });

  const scannedDocuments = useMemo(() => {
    return (documentsQuery.data ?? []).filter((document) => document.ocr_text?.trim());
  }, [documentsQuery.data]);

  const invalidateSmartImport = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.smartImportSuggestions(userId, activeCareProfileId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.documents(userId, activeCareProfileId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.timeline(userId, activeCareProfileId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.medications(userId, activeCareProfileId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.labs(userId, activeCareProfileId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.costs(userId, activeCareProfileId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(userId, activeCareProfileId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.caregiverDashboard(userId) })
    ]);
  };

  const generateMutation = useMutation({
    mutationFn: (document: MedicalDocument) => smartImportService.generateSuggestions(userId, document),
    onSuccess: async (suggestions) => {
      await invalidateSmartImport();
      Alert.alert('Suggestions ready', `${suggestions.length} reviewable suggestion${suggestions.length === 1 ? '' : 's'} created. Nothing was saved to health records yet.`);
    },
    onError: showError
  });

  const approveMutation = useMutation({
    mutationFn: (suggestion: SmartImportSuggestion) => smartImportService.approveSuggestion(userId, suggestion),
    onSuccess: invalidateSmartImport,
    onError: showError
  });

  const rejectMutation = useMutation({
    mutationFn: (suggestionId: string) => smartImportService.rejectSuggestion(userId, suggestionId),
    onSuccess: invalidateSmartImport,
    onError: showError
  });

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([documentsQuery.refetch(), suggestionsQuery.refetch()]);
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: THEME.colors.bg }}
      contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={THEME.colors.teal} />}
    >
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <View style={{
          width: 44,
          height: 44,
          borderRadius: 8,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(168, 85, 247, 0.13)'
        }}>
          <Brain color={THEME.colors.purple} size={22} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: THEME.colors.text, fontSize: 28, fontWeight: '900' }}>Smart Import</Text>
          <Text style={{ color: THEME.colors.muted, marginTop: 3 }}>
            Review OCR suggestions before they become records.
          </Text>
        </View>
      </View>

      <View style={{
        marginTop: 16,
        borderWidth: 1,
        borderColor: 'rgba(0, 212, 170, 0.35)',
        borderRadius: 8,
        backgroundColor: THEME.colors.surface,
        padding: 14
      }}>
        <Text style={{ color: THEME.colors.text, fontWeight: '900', fontSize: 16 }}>
          {activeCareProfile?.full_name ?? 'Active profile'}
        </Text>
        <Text style={{ color: THEME.colors.muted, lineHeight: 21, marginTop: 6 }}>
          Smart Import can suggest medications, labs, timeline events, costs, and document metadata from scanned OCR text. You approve each item one by one.
        </Text>
      </View>

      <Section title="Scanned Documents">
        {documentsQuery.isLoading ? (
          <ActivityIndicator color={THEME.colors.teal} />
        ) : scannedDocuments.length === 0 ? (
          <StateCard
            title="No scanned documents"
            body="Upload a document in Documents, run OCR, then return here to create Smart Import drafts."
          />
        ) : (
          <View style={{ gap: 10 }}>
            {scannedDocuments.map((document) => (
              <DocumentImportCard
                key={document.id}
                document={document}
                generating={generateMutation.isPending}
                onGenerate={() => generateMutation.mutate(document)}
              />
            ))}
          </View>
        )}
      </Section>

      <Section title="Pending Review">
        {suggestionsQuery.isLoading ? (
          <ActivityIndicator color={THEME.colors.teal} />
        ) : (suggestionsQuery.data ?? []).length === 0 ? (
          <StateCard
            title="Nothing pending"
            body="Generate suggestions from a scanned document. MedVault will keep them as drafts until you approve."
          />
        ) : (
          <View style={{ gap: 10 }}>
            {(suggestionsQuery.data ?? []).map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                approving={approveMutation.isPending}
                rejecting={rejectMutation.isPending}
                onApprove={() => {
                  Alert.alert('Approve suggestion?', 'This will create a real MedVault record linked to the source document.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Approve', onPress: () => approveMutation.mutate(suggestion) }
                  ]);
                }}
                onReject={() => rejectMutation.mutate(suggestion.id)}
              />
            ))}
          </View>
        )}
      </Section>
    </ScrollView>
  );
}

function DocumentImportCard({ document, generating, onGenerate }: {
  document: MedicalDocument;
  generating: boolean;
  onGenerate: () => void;
}) {
  const category = DOCUMENT_CATEGORIES.find((item) => item.id === document.document_category)?.label ?? 'Other';
  return (
    <View style={{
      borderWidth: 1,
      borderColor: THEME.colors.border,
      borderRadius: 8,
      backgroundColor: THEME.colors.surface,
      padding: 14
    }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <FileSearch color={THEME.colors.blue} size={22} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: THEME.colors.text, fontWeight: '900', fontSize: 15 }}>{document.file_name}</Text>
          <Text style={{ color: THEME.colors.faint, marginTop: 3 }}>
            {category} | OCR {document.ocr_confidence ?? 'N/A'}%
          </Text>
          <Text style={{ color: THEME.colors.muted, lineHeight: 20, marginTop: 8 }} numberOfLines={3}>
            {document.ocr_text}
          </Text>
        </View>
      </View>
      <Pressable
        disabled={generating}
        onPress={onGenerate}
        style={{
          minHeight: 42,
          borderRadius: 8,
          backgroundColor: THEME.colors.elevated,
          borderWidth: 1,
          borderColor: THEME.colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          marginTop: 12
        }}
      >
        {generating ? <ActivityIndicator color={THEME.colors.teal} /> : <ScanLine color={THEME.colors.teal} size={17} />}
        <Text style={{ color: THEME.colors.teal, fontWeight: '900' }}>Create Review Drafts</Text>
      </Pressable>
    </View>
  );
}

function SuggestionCard({ suggestion, approving, rejecting, onApprove, onReject }: {
  suggestion: SmartImportSuggestion;
  approving: boolean;
  rejecting: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <View style={{
      borderWidth: 1,
      borderColor: THEME.colors.border,
      borderRadius: 8,
      backgroundColor: THEME.colors.surface,
      padding: 14
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{
          borderRadius: 6,
          paddingHorizontal: 8,
          paddingVertical: 4,
          backgroundColor: 'rgba(0, 212, 170, 0.11)'
        }}>
          <Text style={{ color: THEME.colors.teal, fontWeight: '900', fontSize: 11 }}>
            {domainLabel(suggestion.target_domain)}
          </Text>
        </View>
        <Text style={{ color: THEME.colors.faint, fontWeight: '800' }}>Confidence {suggestion.confidence ?? 'N/A'}%</Text>
      </View>
      <Text style={{ color: THEME.colors.text, fontWeight: '900', fontSize: 16, marginTop: 10 }}>
        {payloadSummary(suggestion)}
      </Text>
      <Text style={{ color: THEME.colors.faint, marginTop: 5 }}>
        Source: {suggestion.source_document?.file_name ?? 'OCR document'}
      </Text>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <Pressable
          disabled={approving}
          onPress={onApprove}
          style={{
            flex: 1,
            minHeight: 40,
            borderRadius: 8,
            backgroundColor: THEME.colors.teal,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 7
          }}
        >
          <Check color={THEME.colors.bg} size={16} />
          <Text style={{ color: THEME.colors.bg, fontWeight: '900' }}>Approve</Text>
        </Pressable>
        <Pressable
          disabled={rejecting}
          onPress={onReject}
          style={{
            minHeight: 40,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: 'rgba(239, 68, 68, 0.35)',
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 14
          }}
        >
          <X color={THEME.colors.red} size={16} />
        </Pressable>
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 24 }}>
      <Text style={{ color: THEME.colors.text, fontSize: 18, fontWeight: '900', marginBottom: 10 }}>{title}</Text>
      {children}
    </View>
  );
}

function StateCard({ title, body }: { title: string; body: string }) {
  return (
    <View style={{
      borderWidth: 1,
      borderColor: THEME.colors.border,
      backgroundColor: THEME.colors.surface,
      borderRadius: 8,
      padding: 18,
      alignItems: 'center'
    }}>
      <Brain color={THEME.colors.purple} size={24} />
      <Text style={{ color: THEME.colors.text, fontSize: 17, fontWeight: '900', marginTop: 10 }}>{title}</Text>
      <Text style={{ color: THEME.colors.muted, lineHeight: 20, textAlign: 'center', marginTop: 6 }}>{body}</Text>
    </View>
  );
}

function showError(error: Error) {
  Alert.alert('Smart Import error', error.message);
}
