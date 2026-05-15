import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSearch, Files, Plus, ScanText, Trash2 } from 'lucide-react-native';
import { UpgradeBanner } from '@/components/UpgradeBanner';
import { DOCUMENT_CATEGORIES, THEME } from '@/lib/constants';
import { queryKeys } from '@/lib/queryKeys';
import { canUseAi, getBillingRegion } from '@/lib/subscription';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { documentService } from '@/services/document.service';
import { useProfileStore } from '@/store/useProfileStore';
import type { DocumentCategory, MedicalDocument } from '@/types';

export default function DocumentsScreen() {
  const { user } = useAuth();
  const { activeProfileId, familyMembers, profile } = useProfileStore();
  const queryClient = useQueryClient();
  const userId = user?.id ?? '';
  const activeFamilyMember = familyMembers.find((member) => member.id === activeProfileId);
  const aiGate = canUseAi(profile);
  const region = profile?.billing_region ?? getBillingRegion(profile?.country);

  const [category, setCategory] = useState<DocumentCategory>('lab_report');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const documentsQuery = useQuery({
    queryKey: queryKeys.documents(userId, activeProfileId),
    queryFn: () => documentService.getDocuments(userId, activeProfileId),
    enabled: !!userId
  });

  const filteredDocuments = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return documentsQuery.data ?? [];
    return (documentsQuery.data ?? []).filter((document) =>
      document.file_name.toLowerCase().includes(needle) ||
      document.ocr_text?.toLowerCase().includes(needle)
    );
  }, [documentsQuery.data, search]);

  const invalidateDocuments = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.documents(userId, activeProfileId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(userId, activeProfileId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) })
    ]);
  };

  const uploadMutation = useMutation({
    mutationFn: () => documentService.pickAndUploadDocument(userId, activeProfileId, category),
    onSuccess: invalidateDocuments,
    onError: showError
  });

  const deleteMutation = useMutation({
    mutationFn: (documentId: string) => documentService.softDeleteDocument(documentId),
    onSuccess: invalidateDocuments,
    onError: showError
  });

  const scanMutation = useMutation({
    mutationFn: (documentId: string) => documentService.scanDocument(documentId),
    onSuccess: invalidateDocuments,
    onError: showError
  });

  const refresh = async () => {
    setRefreshing(true);
    await documentsQuery.refetch();
    setRefreshing(false);
  };

  const requestScan = (document: MedicalDocument) => {
    if (!aiGate.allowed) {
      Alert.alert('AI quota reached', aiGate.reason ?? 'Upgrade to Pro for unlimited OCR and AI features.');
      return;
    }
    Alert.alert('Scan this document?', 'OCR sends this selected document to the AI scanner. Other documents are not included.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Scan', onPress: () => scanMutation.mutate(document.id) }
    ]);
  };

  const confirmDelete = (document: MedicalDocument) => {
    Alert.alert('Delete document?', `"${document.file_name}" will be removed from your vault metadata.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(document.id) }
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: THEME.colors.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 112 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={THEME.colors.teal} />}
      >
        <Text style={{ color: THEME.colors.text, fontSize: 30, fontWeight: '900' }}>Documents</Text>
        <Text style={{ color: THEME.colors.teal, fontSize: 13, fontWeight: '800', marginTop: 6 }}>
          {activeFamilyMember?.full_name ?? 'My Vault'}
        </Text>

        {!aiGate.allowed ? (
          <View style={{ marginTop: 16 }}>
            <UpgradeBanner region={region} message={aiGate.reason ?? 'Upgrade to Pro for unlimited OCR and AI features.'} />
          </View>
        ) : null}

        <View style={{ marginTop: 18 }}>
          <Text style={{ color: THEME.colors.muted, fontSize: 13, fontWeight: '900', marginBottom: 8 }}>Upload category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {DOCUMENT_CATEGORIES.map((item) => (
                <CategoryChip key={item.id} label={item.label} active={category === item.id} onPress={() => setCategory(item.id)} />
              ))}
            </View>
          </ScrollView>
        </View>

        <Pressable
          onPress={() => uploadMutation.mutate()}
          disabled={uploadMutation.isPending}
          style={{ minHeight: 52, borderRadius: 8, backgroundColor: THEME.colors.teal, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 16, opacity: uploadMutation.isPending ? 0.7 : 1 }}
        >
          {uploadMutation.isPending ? <ActivityIndicator color={THEME.colors.bg} /> : <Plus color={THEME.colors.bg} size={20} />}
          <Text style={{ color: THEME.colors.bg, fontWeight: '900', fontSize: 15 }}>Upload Document</Text>
        </Pressable>

        <View style={{ marginTop: 16, height: 48, borderWidth: 1, borderColor: THEME.colors.border, borderRadius: 8, backgroundColor: THEME.colors.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10 }}>
          <FileSearch color={THEME.colors.faint} size={18} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search file names or OCR text"
            placeholderTextColor={THEME.colors.faint}
            style={{ color: THEME.colors.text, flex: 1, fontSize: 15 }}
          />
        </View>

        {documentsQuery.isLoading ? (
          <View style={{ paddingVertical: 64, alignItems: 'center' }}>
            <ActivityIndicator color={THEME.colors.teal} size="large" />
            <Text style={{ color: THEME.colors.muted, marginTop: 12 }}>Loading documents...</Text>
          </View>
        ) : documentsQuery.isError ? (
          <StateCard title="Documents unavailable" body="Connect Supabase env values and run the database migration before testing document upload." />
        ) : filteredDocuments.length === 0 ? (
          <StateCard title="No documents found" body="Upload prescriptions, lab reports, discharge summaries, imaging files, insurance papers, and receipts." />
        ) : (
          <View style={{ gap: 12, marginTop: 20 }}>
            {filteredDocuments.map((document) => (
              <DocumentCard key={document.id} document={document} onScan={() => requestScan(document)} onDelete={() => confirmDelete(document)} scanning={scanMutation.isPending} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function showError(error: Error) {
  Alert.alert('Document error', error.message);
}

function CategoryChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ height: 36, paddingHorizontal: 13, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? THEME.colors.teal : THEME.colors.surface, borderWidth: 1, borderColor: active ? THEME.colors.teal : THEME.colors.border }}>
      <Text style={{ color: active ? THEME.colors.bg : THEME.colors.muted, fontWeight: '900', fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

function DocumentCard({ document, scanning, onScan, onDelete }: { document: MedicalDocument; scanning: boolean; onScan: () => void; onDelete: () => void }) {
  const confidence = getConfidence(document.ocr_confidence);
  const categoryLabel = DOCUMENT_CATEGORIES.find((item) => item.id === document.document_category)?.label ?? 'Other';

  return (
    <View style={{ borderWidth: 1, borderColor: THEME.colors.border, backgroundColor: THEME.colors.surface, borderRadius: 8, padding: 14 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(59, 130, 246, 0.12)' }}>
          <Files color={THEME.colors.blue} size={22} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: THEME.colors.text, fontSize: 16, fontWeight: '900' }}>{document.file_name}</Text>
          <Text style={{ color: THEME.colors.muted, marginTop: 4 }}>{categoryLabel} - {formatDate(document.created_at)}</Text>
          <Text style={{ color: THEME.colors.faint, marginTop: 4 }}>{formatBytes(document.file_size)} · {document.file_type ?? 'unknown type'}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <View style={{ borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: `${confidence.color}22` }}>
          <Text style={{ color: confidence.color, fontWeight: '900', fontSize: 11 }}>{confidence.label}</Text>
        </View>
        {document.is_handwritten ? <Text style={{ color: THEME.colors.amber, fontWeight: '800', fontSize: 12 }}>HANDWRITTEN</Text> : null}
      </View>

      {document.ocr_text ? (
        <Text style={{ color: THEME.colors.muted, lineHeight: 20, marginTop: 10 }} numberOfLines={4}>{document.ocr_text}</Text>
      ) : (
        <Text style={{ color: THEME.colors.faint, lineHeight: 20, marginTop: 10 }}>No OCR text yet. Scan only if you want this selected document analyzed.</Text>
      )}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <ActionButton label={scanning ? 'Scanning...' : 'OCR'} icon={<ScanText color={THEME.colors.purple} size={15} />} onPress={onScan} />
        <ActionButton label="Delete" icon={<Trash2 color={THEME.colors.red} size={15} />} onPress={onDelete} danger />
      </View>
    </View>
  );
}

function StateCard({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ marginTop: 22, borderWidth: 1, borderColor: THEME.colors.border, backgroundColor: THEME.colors.surface, borderRadius: 8, padding: 18, alignItems: 'center' }}>
      <Files color={THEME.colors.blue} size={24} />
      <Text style={{ color: THEME.colors.text, fontSize: 17, fontWeight: '900', marginTop: 10 }}>{title}</Text>
      <Text style={{ color: THEME.colors.muted, lineHeight: 20, textAlign: 'center', marginTop: 6 }}>{body}</Text>
    </View>
  );
}

function ActionButton({ label, icon, onPress, danger }: { label: string; icon: React.ReactNode; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1, minHeight: 38, borderRadius: 8, borderWidth: 1, borderColor: danger ? 'rgba(239, 68, 68, 0.35)' : THEME.colors.border, backgroundColor: danger ? 'rgba(239, 68, 68, 0.08)' : THEME.colors.elevated, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}>
      {icon}
      <Text style={{ color: danger ? THEME.colors.red : THEME.colors.teal, fontWeight: '900', fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

function getConfidence(confidence: number | null) {
  if (confidence == null) return { label: 'NOT SCANNED', color: THEME.colors.faint };
  if (confidence >= 80) return { label: `HIGH ${confidence}%`, color: THEME.colors.green };
  if (confidence >= 50) return { label: `VERIFY ${confidence}%`, color: THEME.colors.amber };
  return { label: `LOW ${confidence}%`, color: THEME.colors.red };
}

function formatBytes(size: number | null) {
  if (!size) return 'Unknown size';
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
