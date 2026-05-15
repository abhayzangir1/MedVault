import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Edit3, FlaskConical, Plus, Trash2, X } from 'lucide-react-native';
import { z } from 'zod';
import { UpgradeBanner } from '@/components/UpgradeBanner';
import { THEME } from '@/lib/constants';
import { queryKeys } from '@/lib/queryKeys';
import { canUseAi, getBillingRegion } from '@/lib/subscription';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { labService } from '@/services/lab.service';
import { useProfileStore } from '@/store/useProfileStore';
import type { LabFlag, LabMarker, LabMarkerInput, LabResult, LabResultInput } from '@/types';

const labSchema = z.object({
  test_name: z.string().min(2, 'Test name is required.'),
  test_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD.'),
  markers: z.array(z.object({
    marker: z.string().min(1, 'Marker name is required.'),
    value: z.string().min(1, 'Value is required.'),
    unit: z.string().min(1, 'Unit is required.'),
    reference_low: z.string().min(1, 'Reference low is required.'),
    reference_high: z.string().min(1, 'Reference high is required.')
  })).min(1, 'Add at least one marker.')
});

export default function LabsScreen() {
  const { user } = useAuth();
  const { activeProfileId, familyMembers, profile } = useProfileStore();
  const queryClient = useQueryClient();
  const userId = user?.id ?? '';
  const activeFamilyMember = familyMembers.find((member) => member.id === activeProfileId);
  const aiGate = canUseAi(profile);
  const region = profile?.billing_region ?? getBillingRegion(profile?.country);

  const [editingLab, setEditingLab] = useState<LabResult | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const labsQuery = useQuery({
    queryKey: queryKeys.labs(userId, activeProfileId),
    queryFn: () => labService.getLabResults(userId, activeProfileId),
    enabled: !!userId
  });

  const invalidateLabs = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.labs(userId, activeProfileId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) })
    ]);
  };

  const createMutation = useMutation({
    mutationFn: (input: LabResultInput) => labService.createLabResult(userId, activeProfileId, input),
    onSuccess: async () => {
      await invalidateLabs();
      setIsFormOpen(false);
      setEditingLab(null);
    },
    onError: showError
  });

  const updateMutation = useMutation({
    mutationFn: (input: LabResultInput) => {
      if (!editingLab) throw new Error('No lab result selected.');
      return labService.updateLabResult(editingLab.id, input);
    },
    onSuccess: async () => {
      await invalidateLabs();
      setIsFormOpen(false);
      setEditingLab(null);
    },
    onError: showError
  });

  const deleteMutation = useMutation({
    mutationFn: (labId: string) => labService.softDeleteLabResult(labId),
    onSuccess: invalidateLabs,
    onError: showError
  });

  const aiMutation = useMutation({
    mutationFn: (labId: string) => labService.generateInterpretation(labId),
    onSuccess: invalidateLabs,
    onError: showError
  });

  const refresh = async () => {
    setRefreshing(true);
    await labsQuery.refetch();
    setRefreshing(false);
  };

  const openCreate = () => {
    setEditingLab(null);
    setIsFormOpen(true);
  };

  const openEdit = (lab: LabResult) => {
    setEditingLab(lab);
    setIsFormOpen(true);
  };

  const confirmDelete = (lab: LabResult) => {
    Alert.alert('Delete lab result?', `"${lab.test_name}" will be removed from your records.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(lab.id) }
    ]);
  };

  const requestAi = (lab: LabResult) => {
    if (!aiGate.allowed) {
      Alert.alert('AI quota reached', aiGate.reason ?? 'Upgrade to Pro Family for more AI features.');
      return;
    }
    Alert.alert(
      'AI summary',
      'AI output is informational only, is not medical advice, and should be reviewed with a qualified clinician.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: () => aiMutation.mutate(lab.id) }
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: THEME.colors.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 112 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={THEME.colors.teal} />}
      >
        <Text style={{ color: THEME.colors.text, fontSize: 30, fontWeight: '900' }}>Lab Results</Text>
        <Text style={{ color: THEME.colors.teal, fontSize: 13, fontWeight: '800', marginTop: 6 }}>
          {activeFamilyMember?.full_name ?? 'My Vault'}
        </Text>
        <Text style={{ color: THEME.colors.faint, lineHeight: 19, marginTop: 10 }}>
          AI summaries are informational only and are not medical advice. Review abnormal or urgent values with a qualified clinician.
        </Text>

        {!aiGate.allowed ? (
          <View style={{ marginTop: 16 }}>
            <UpgradeBanner region={region} message={aiGate.reason ?? 'Upgrade to Pro Family for more AI lab interpretations.'} />
          </View>
        ) : null}

        {labsQuery.isLoading ? (
          <View style={{ paddingVertical: 64, alignItems: 'center' }}>
            <ActivityIndicator color={THEME.colors.teal} size="large" />
            <Text style={{ color: THEME.colors.muted, marginTop: 12 }}>Loading lab results...</Text>
          </View>
        ) : labsQuery.isError ? (
          <StateCard title="Lab results unavailable" body="Connect Supabase env values and run the database migration before testing live lab data." />
        ) : (labsQuery.data?.length ?? 0) === 0 ? (
          <StateCard title="No lab results yet" body="Add tests like CBC, HbA1c, lipids, thyroid, kidney, and liver panels here." />
        ) : (
          <View style={{ gap: 12, marginTop: 20 }}>
            {labsQuery.data?.map((lab) => (
              <LabCard
                key={lab.id}
                lab={lab}
                aiPending={aiMutation.isPending}
                onAi={() => requestAi(lab)}
                onEdit={() => openEdit(lab)}
                onDelete={() => confirmDelete(lab)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <Pressable
        onPress={openCreate}
        style={{ position: 'absolute', right: 20, bottom: 82, width: 56, height: 56, borderRadius: 28, backgroundColor: THEME.colors.teal, alignItems: 'center', justifyContent: 'center', elevation: 6 }}
      >
        <Plus color={THEME.colors.bg} size={26} />
      </Pressable>

      <LabFormModal
        visible={isFormOpen}
        lab={editingLab}
        pending={createMutation.isPending || updateMutation.isPending}
        onClose={() => {
          setIsFormOpen(false);
          setEditingLab(null);
        }}
        onSubmit={(input) => {
          if (editingLab) updateMutation.mutate(input);
          else createMutation.mutate(input);
        }}
      />
    </View>
  );
}

function showError(error: Error) {
  Alert.alert('Lab error', error.message);
}

function LabCard({ lab, aiPending, onAi, onEdit, onDelete }: { lab: LabResult; aiPending: boolean; onAi: () => void; onEdit: () => void; onDelete: () => void }) {
  const abnormalCount = lab.results.filter((marker) => marker.flag !== 'normal').length;

  return (
    <View style={{ borderWidth: 1, borderColor: abnormalCount > 0 ? 'rgba(245, 158, 11, 0.42)' : THEME.colors.border, backgroundColor: THEME.colors.surface, borderRadius: 8, padding: 14 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(168, 85, 247, 0.12)' }}>
          <FlaskConical color={THEME.colors.purple} size={22} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: THEME.colors.text, fontSize: 17, fontWeight: '900' }}>{lab.test_name}</Text>
          <Text style={{ color: THEME.colors.muted, marginTop: 4 }}>{formatDate(lab.test_date)} - {lab.results.length} marker{lab.results.length === 1 ? '' : 's'}</Text>
          <Text style={{ color: abnormalCount > 0 ? THEME.colors.amber : THEME.colors.green, fontWeight: '900', marginTop: 6 }}>
            {abnormalCount > 0 ? `${abnormalCount} abnormal marker${abnormalCount === 1 ? '' : 's'}` : 'All markers in range'}
          </Text>
        </View>
      </View>

      <View style={{ gap: 8, marginTop: 12 }}>
        {lab.results.map((marker) => <MarkerRow key={`${marker.marker}-${marker.unit}`} marker={marker} />)}
      </View>

      {lab.ai_interpretation ? (
        <View style={{ marginTop: 12, borderWidth: 1, borderColor: 'rgba(168, 85, 247, 0.35)', borderRadius: 8, padding: 12, backgroundColor: 'rgba(168, 85, 247, 0.08)' }}>
          <Text style={{ color: THEME.colors.purple, fontSize: 13, fontWeight: '900' }}>AI interpretation</Text>
          <Text style={{ color: THEME.colors.text, lineHeight: 20, marginTop: 6 }}>{lab.ai_interpretation}</Text>
          <Text style={{ color: THEME.colors.faint, lineHeight: 18, marginTop: 8 }}>Informational only. Review with a qualified clinician.</Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <ActionButton label={aiPending ? 'Thinking...' : 'AI Summary'} icon={<Bot color={THEME.colors.purple} size={15} />} onPress={onAi} />
        <ActionButton label="Edit" icon={<Edit3 color={THEME.colors.teal} size={15} />} onPress={onEdit} />
        <ActionButton label="Delete" icon={<Trash2 color={THEME.colors.red} size={15} />} onPress={onDelete} danger />
      </View>
    </View>
  );
}

function MarkerRow({ marker }: { marker: LabMarker }) {
  const color = getFlagColor(marker.flag);
  const range = marker.reference_high - marker.reference_low;
  const position = range > 0 ? Math.max(0, Math.min(100, ((marker.value - marker.reference_low) / range) * 100)) : 50;

  return (
    <View style={{ borderWidth: 1, borderColor: THEME.colors.border, borderRadius: 8, padding: 10, backgroundColor: THEME.colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: THEME.colors.text, fontWeight: '900', flex: 1 }}>{marker.marker}</Text>
        <Text style={{ color, fontWeight: '900', fontSize: 12 }}>{marker.flag.toUpperCase()}</Text>
      </View>
      <Text style={{ color: THEME.colors.muted, marginTop: 4 }}>{marker.value} {marker.unit} - range {marker.reference_low}-{marker.reference_high}</Text>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: THEME.colors.border, marginTop: 8, overflow: 'hidden' }}>
        <View style={{ width: `${position}%`, height: 6, backgroundColor: color }} />
      </View>
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

function StateCard({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ marginTop: 22, borderWidth: 1, borderColor: THEME.colors.border, backgroundColor: THEME.colors.surface, borderRadius: 8, padding: 18, alignItems: 'center' }}>
      <FlaskConical color={THEME.colors.purple} size={24} />
      <Text style={{ color: THEME.colors.text, fontSize: 17, fontWeight: '900', marginTop: 10 }}>{title}</Text>
      <Text style={{ color: THEME.colors.muted, lineHeight: 20, textAlign: 'center', marginTop: 6 }}>{body}</Text>
    </View>
  );
}

function LabFormModal({ visible, lab, pending, onClose, onSubmit }: { visible: boolean; lab: LabResult | null; pending: boolean; onClose: () => void; onSubmit: (input: LabResultInput) => void }) {
  const [testName, setTestName] = useState(lab?.test_name ?? '');
  const [testDate, setTestDate] = useState(lab?.test_date ?? new Date().toISOString().slice(0, 10));
  const [markers, setMarkers] = useState<LabMarkerInput[]>(toMarkerInputs(lab));

  useMemo(() => {
    setTestName(lab?.test_name ?? '');
    setTestDate(lab?.test_date ?? new Date().toISOString().slice(0, 10));
    setMarkers(toMarkerInputs(lab));
  }, [lab, visible]);

  const submit = () => {
    const parsed = labSchema.safeParse({ test_name: testName, test_date: testDate, markers });
    if (!parsed.success) {
      Alert.alert('Check lab details', parsed.error.issues[0]?.message ?? 'Invalid lab result.');
      return;
    }
    onSubmit(parsed.data);
  };

  const updateMarker = (index: number, patch: Partial<LabMarkerInput>) => {
    setMarkers((current) => current.map((marker, markerIndex) => markerIndex === index ? { ...marker, ...patch } : marker));
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.45)' }}>
        <View style={{ maxHeight: '92%', backgroundColor: THEME.colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: THEME.colors.border, padding: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ color: THEME.colors.text, fontSize: 20, fontWeight: '900', flex: 1 }}>{lab ? 'Edit lab result' : 'Add lab result'}</Text>
            <Pressable onPress={onClose}>
              <X color={THEME.colors.muted} size={22} />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Field label="Test name" value={testName} onChangeText={setTestName} placeholder="e.g. Complete Blood Count" />
            <Field label="Test date" value={testDate} onChangeText={setTestDate} placeholder="YYYY-MM-DD" />
            <Text style={{ color: THEME.colors.text, fontSize: 16, fontWeight: '900', marginBottom: 10 }}>Markers</Text>
            <View style={{ gap: 12 }}>
              {markers.map((marker, index) => (
                <View key={index} style={{ borderWidth: 1, borderColor: THEME.colors.border, borderRadius: 8, padding: 12, backgroundColor: THEME.colors.bg }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Field label="Marker" value={marker.marker} onChangeText={(value) => updateMarker(index, { marker: value })} placeholder="Hemoglobin" />
                    </View>
                    <Pressable onPress={() => setMarkers((current) => current.filter((_, markerIndex) => markerIndex !== index))} style={{ width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(239, 68, 68, 0.1)', marginTop: 24 }}>
                      <Trash2 color={THEME.colors.red} size={17} />
                    </Pressable>
                  </View>
                  <Field label="Value" value={marker.value} onChangeText={(value) => updateMarker(index, { value })} placeholder="13.8" />
                  <Field label="Unit" value={marker.unit} onChangeText={(value) => updateMarker(index, { unit: value })} placeholder="g/dL" />
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Field label="Ref low" value={marker.reference_low} onChangeText={(value) => updateMarker(index, { reference_low: value })} placeholder="12" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field label="Ref high" value={marker.reference_high} onChangeText={(value) => updateMarker(index, { reference_high: value })} placeholder="17.5" />
                    </View>
                  </View>
                </View>
              ))}
            </View>
            <Pressable onPress={() => setMarkers((current) => [...current, emptyMarker()])} style={{ height: 44, borderRadius: 8, borderWidth: 1, borderColor: THEME.colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 12 }}>
              <Text style={{ color: THEME.colors.teal, fontWeight: '900' }}>Add marker</Text>
            </Pressable>
            <Pressable onPress={submit} disabled={pending} style={{ height: 52, borderRadius: 8, backgroundColor: THEME.colors.teal, alignItems: 'center', justifyContent: 'center', opacity: pending ? 0.7 : 1, marginVertical: 16 }}>
              {pending ? <ActivityIndicator color={THEME.colors.bg} /> : <Text style={{ color: THEME.colors.bg, fontSize: 16, fontWeight: '900' }}>{lab ? 'Save Changes' : 'Save Lab Result'}</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Field({ label, value, onChangeText, placeholder }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: THEME.colors.muted, fontSize: 13, fontWeight: '900', marginBottom: 7 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={THEME.colors.faint}
        style={{ minHeight: 46, borderWidth: 1, borderColor: THEME.colors.border, backgroundColor: THEME.colors.bg, borderRadius: 8, paddingHorizontal: 12, color: THEME.colors.text }}
      />
    </View>
  );
}

function emptyMarker(): LabMarkerInput {
  return { marker: '', value: '', unit: '', reference_low: '', reference_high: '' };
}

function toMarkerInputs(lab: LabResult | null): LabMarkerInput[] {
  if (!lab) return [emptyMarker()];
  return lab.results.map((marker) => ({
    marker: marker.marker,
    value: String(marker.value),
    unit: marker.unit,
    reference_low: String(marker.reference_low),
    reference_high: String(marker.reference_high)
  }));
}

function getFlagColor(flag: LabFlag) {
  if (flag === 'critical') return THEME.colors.red;
  if (flag === 'high' || flag === 'low') return THEME.colors.amber;
  return THEME.colors.green;
}
