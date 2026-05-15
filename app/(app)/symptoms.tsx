import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, RefreshControl, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, CheckCircle2, Edit3, HeartPulse, Plus, Search, Trash2, X } from 'lucide-react-native';
import { z } from 'zod';
import { THEME } from '@/lib/constants';
import { queryKeys } from '@/lib/queryKeys';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { symptomService } from '@/services/symptom.service';
import type { PickedSymptomPhoto, SymptomFilters } from '@/services/symptom.service';
import { useProfileStore } from '@/store/useProfileStore';
import type { SymptomEntry, SymptomInput } from '@/types';

const symptomSchema = z.object({
  symptom_name: z.string().min(2, 'Symptom name must be at least 2 characters.'),
  severity: z.number().min(1).max(10),
  onset_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD.'),
  notes: z.string().optional(),
  resolved: z.boolean(),
  resolved_date: z.string().optional().refine((value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value), 'Resolved date must use YYYY-MM-DD.')
});

type ResolvedFilter = 'all' | 'active' | 'resolved';

export default function SymptomsScreen() {
  const { user } = useAuth();
  const { activeCareProfileId, familyMembers } = useProfileStore();
  const queryClient = useQueryClient();
  const userId = user?.id ?? '';
  const activeFamilyMember = familyMembers.find((member) => member.id === activeCareProfileId);

  const [search, setSearch] = useState('');
  const [resolved, setResolved] = useState<ResolvedFilter>('active');
  const [minSeverity, setMinSeverity] = useState(1);
  const [editingSymptom, setEditingSymptom] = useState<SymptomEntry | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const filters = useMemo<SymptomFilters>(() => ({ search, resolved, minSeverity }), [minSeverity, resolved, search]);

  const symptomsQuery = useQuery({
    queryKey: [...queryKeys.symptoms(userId, activeCareProfileId), filters] as const,
    queryFn: () => symptomService.getSymptoms(userId, activeCareProfileId, filters),
    enabled: !!userId
  });

  const invalidateConnectedData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.symptoms(userId, activeCareProfileId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(userId, activeCareProfileId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) })
    ]);
  };

  const createMutation = useMutation({
    mutationFn: async ({ input, photo }: { input: SymptomInput; photo: PickedSymptomPhoto | null }) => {
      const symptom = await symptomService.createSymptom(userId, activeCareProfileId, input);
      if (photo) await symptomService.uploadSymptomPhoto(userId, symptom.id, photo);
      return symptom;
    },
    onSuccess: async () => {
      await invalidateConnectedData();
      setIsFormOpen(false);
      setEditingSymptom(null);
    },
    onError: showError
  });

  const updateMutation = useMutation({
    mutationFn: async ({ input, photo }: { input: SymptomInput; photo: PickedSymptomPhoto | null }) => {
      if (!editingSymptom) throw new Error('No symptom selected.');
      const symptom = await symptomService.updateSymptom(editingSymptom.id, input);
      if (photo) await symptomService.uploadSymptomPhoto(userId, symptom.id, photo);
      return symptom;
    },
    onSuccess: async () => {
      await invalidateConnectedData();
      setIsFormOpen(false);
      setEditingSymptom(null);
    },
    onError: showError
  });

  const deleteMutation = useMutation({
    mutationFn: (symptomId: string) => symptomService.softDeleteSymptom(symptomId),
    onSuccess: invalidateConnectedData,
    onError: showError
  });

  const refresh = async () => {
    setRefreshing(true);
    await symptomsQuery.refetch();
    setRefreshing(false);
  };

  const openCreate = () => {
    setEditingSymptom(null);
    setIsFormOpen(true);
  };

  const openEdit = (symptom: SymptomEntry) => {
    setEditingSymptom(symptom);
    setIsFormOpen(true);
  };

  const confirmDelete = (symptom: SymptomEntry) => {
    Alert.alert('Delete symptom?', `"${symptom.symptom_name}" will be removed from this care profile.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(symptom.id) }
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: THEME.colors.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 112 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={THEME.colors.teal} />}
      >
        <Text style={{ color: THEME.colors.text, fontSize: 30, fontWeight: '900' }}>Symptoms</Text>
        <Text style={{ color: THEME.colors.teal, fontSize: 13, fontWeight: '800', marginTop: 6 }}>
          {activeFamilyMember?.full_name ?? 'My Vault'}
        </Text>

        <View style={{ marginTop: 18, gap: 12 }}>
          <View style={{ height: 48, borderWidth: 1, borderColor: THEME.colors.border, borderRadius: 8, backgroundColor: THEME.colors.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10 }}>
            <Search color={THEME.colors.faint} size={18} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search symptoms"
              placeholderTextColor={THEME.colors.faint}
              style={{ color: THEME.colors.text, flex: 1, fontSize: 15 }}
            />
            {search.length > 0 ? (
              <Pressable onPress={() => setSearch('')}>
                <X color={THEME.colors.faint} size={18} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <FilterChip label="Active" active={resolved === 'active'} onPress={() => setResolved('active')} />
              <FilterChip label="Resolved" active={resolved === 'resolved'} onPress={() => setResolved('resolved')} />
              <FilterChip label="All" active={resolved === 'all'} onPress={() => setResolved('all')} />
              {[1, 4, 7].map((severity) => (
                <FilterChip key={severity} label={severity === 1 ? 'Any severity' : `${severity}+ severity`} active={minSeverity === severity} onPress={() => setMinSeverity(severity)} />
              ))}
            </View>
          </ScrollView>
        </View>

        {symptomsQuery.isLoading ? (
          <View style={{ paddingVertical: 64, alignItems: 'center' }}>
            <ActivityIndicator color={THEME.colors.teal} size="large" />
            <Text style={{ color: THEME.colors.muted, marginTop: 12 }}>Loading symptoms...</Text>
          </View>
        ) : symptomsQuery.isError ? (
          <StateCard title="Symptoms unavailable" body="Connect Supabase env values and run the latest database migration before testing live symptom data." />
        ) : (symptomsQuery.data?.length ?? 0) === 0 ? (
          <StateCard title="No symptoms found" body="Track symptoms, severity, notes, resolved state, and photos for each care profile." />
        ) : (
          <View style={{ gap: 12, marginTop: 20 }}>
            {symptomsQuery.data?.map((symptom) => (
              <SymptomCard key={symptom.id} symptom={symptom} onEdit={() => openEdit(symptom)} onDelete={() => confirmDelete(symptom)} />
            ))}
          </View>
        )}
      </ScrollView>

      <Pressable
        onPress={openCreate}
        style={{
          position: 'absolute',
          right: 20,
          bottom: 82,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: THEME.colors.teal,
          alignItems: 'center',
          justifyContent: 'center',
          elevation: 6
        }}
      >
        <Plus color={THEME.colors.bg} size={26} />
      </Pressable>

      <SymptomFormModal
        visible={isFormOpen}
        symptom={editingSymptom}
        pending={createMutation.isPending || updateMutation.isPending}
        onClose={() => {
          setIsFormOpen(false);
          setEditingSymptom(null);
        }}
        onSubmit={(input, photo) => {
          if (editingSymptom) updateMutation.mutate({ input, photo });
          else createMutation.mutate({ input, photo });
        }}
      />
    </View>
  );
}

function showError(error: Error) {
  Alert.alert('Symptom error', error.message);
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 13,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? THEME.colors.teal : THEME.colors.surface,
        borderWidth: 1,
        borderColor: active ? THEME.colors.teal : THEME.colors.border
      }}
    >
      <Text style={{ color: active ? THEME.colors.bg : THEME.colors.muted, fontWeight: '900', fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

function SymptomCard({ symptom, onEdit, onDelete }: { symptom: SymptomEntry; onEdit: () => void; onDelete: () => void }) {
  const severityColor = symptom.severity >= 8 ? THEME.colors.red : symptom.severity >= 5 ? THEME.colors.amber : THEME.colors.green;
  const firstPhoto = symptom.photos?.[0];

  return (
    <View style={{ borderWidth: 1, borderColor: `${severityColor}66`, backgroundColor: THEME.colors.surface, borderRadius: 8, padding: 14 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: `${severityColor}18`, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: severityColor, fontWeight: '900', fontSize: 19 }}>{symptom.severity}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ color: THEME.colors.text, fontSize: 17, fontWeight: '900', flex: 1 }}>{symptom.symptom_name}</Text>
            {symptom.resolved ? <CheckCircle2 color={THEME.colors.green} size={18} /> : null}
          </View>
          <Text style={{ color: THEME.colors.teal, fontSize: 12, fontWeight: '800', marginTop: 5 }}>
            Started {formatDate(symptom.onset_date)}
            {symptom.resolved && symptom.resolved_date ? ` · resolved ${formatDate(symptom.resolved_date)}` : ''}
          </Text>
          {symptom.notes ? <Text style={{ color: THEME.colors.muted, lineHeight: 20, marginTop: 8 }}>{symptom.notes}</Text> : null}
        </View>
      </View>

      {firstPhoto ? (
        <Image
          source={{ uri: firstPhoto.photo_url }}
          style={{ width: '100%', height: 160, borderRadius: 8, marginTop: 12, backgroundColor: THEME.colors.bg }}
          resizeMode="cover"
        />
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <ActionButton label="Edit" icon={<Edit3 color={THEME.colors.teal} size={15} />} onPress={onEdit} />
        <ActionButton label="Delete" icon={<Trash2 color={THEME.colors.red} size={15} />} onPress={onDelete} danger />
      </View>
    </View>
  );
}

function ActionButton({ label, icon, onPress, danger }: { label: string; icon: React.ReactNode; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        height: 38,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: danger ? 'rgba(239, 68, 68, 0.35)' : THEME.colors.border,
        backgroundColor: danger ? 'rgba(239, 68, 68, 0.08)' : THEME.colors.elevated,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8
      }}
    >
      {icon}
      <Text style={{ color: danger ? THEME.colors.red : THEME.colors.teal, fontWeight: '900', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

function StateCard({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ marginTop: 22, borderWidth: 1, borderColor: THEME.colors.border, backgroundColor: THEME.colors.surface, borderRadius: 8, padding: 18, alignItems: 'center' }}>
      <HeartPulse color={THEME.colors.teal} size={24} />
      <Text style={{ color: THEME.colors.text, fontSize: 17, fontWeight: '900', marginTop: 10 }}>{title}</Text>
      <Text style={{ color: THEME.colors.muted, lineHeight: 20, textAlign: 'center', marginTop: 6 }}>{body}</Text>
    </View>
  );
}

function SymptomFormModal({
  visible,
  symptom,
  pending,
  onClose,
  onSubmit
}: {
  visible: boolean;
  symptom: SymptomEntry | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: SymptomInput, photo: PickedSymptomPhoto | null) => void;
}) {
  const [name, setName] = useState(symptom?.symptom_name ?? '');
  const [severity, setSeverity] = useState(String(symptom?.severity ?? 5));
  const [onsetDate, setOnsetDate] = useState(symptom?.onset_date ?? new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState(symptom?.notes ?? '');
  const [resolved, setResolved] = useState(symptom?.resolved ?? false);
  const [resolvedDate, setResolvedDate] = useState(symptom?.resolved_date ?? '');
  const [photo, setPhoto] = useState<PickedSymptomPhoto | null>(null);

  useMemo(() => {
    setName(symptom?.symptom_name ?? '');
    setSeverity(String(symptom?.severity ?? 5));
    setOnsetDate(symptom?.onset_date ?? new Date().toISOString().slice(0, 10));
    setNotes(symptom?.notes ?? '');
    setResolved(symptom?.resolved ?? false);
    setResolvedDate(symptom?.resolved_date ?? '');
    setPhoto(null);
  }, [symptom, visible]);

  const pickPhoto = async () => {
    try {
      const picked = await symptomService.pickSymptomPhoto();
      if (picked) setPhoto(picked);
    } catch (error) {
      showError(error instanceof Error ? error : new Error('Unable to pick photo.'));
    }
  };

  const submit = () => {
    const parsed = symptomSchema.safeParse({
      symptom_name: name,
      severity: Number(severity),
      onset_date: onsetDate,
      notes,
      resolved,
      resolved_date: resolved ? resolvedDate || new Date().toISOString().slice(0, 10) : undefined
    });

    if (!parsed.success) {
      Alert.alert('Check symptom details', parsed.error.issues[0]?.message ?? 'Invalid symptom.');
      return;
    }

    onSubmit(parsed.data, photo);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.45)' }}>
        <View style={{ maxHeight: '90%', backgroundColor: THEME.colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: THEME.colors.border, padding: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ color: THEME.colors.text, fontSize: 20, fontWeight: '900', flex: 1 }}>{symptom ? 'Edit symptom' : 'Add symptom'}</Text>
            <Pressable onPress={onClose}>
              <X color={THEME.colors.muted} size={22} />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Field label="Symptom" value={name} onChangeText={setName} placeholder="e.g. Headache, fever, back pain" />
            <Field label="Severity 1-10" value={severity} onChangeText={setSeverity} placeholder="5" keyboardType="number-pad" />
            <Field label="Onset date" value={onsetDate} onChangeText={setOnsetDate} placeholder="YYYY-MM-DD" />
            <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Triggers, duration, medication taken..." multiline />
            <View style={{ minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <Text style={{ color: THEME.colors.text, fontSize: 14, fontWeight: '900' }}>Resolved</Text>
              <Switch value={resolved} onValueChange={setResolved} thumbColor={resolved ? THEME.colors.green : THEME.colors.faint} trackColor={{ false: THEME.colors.border, true: 'rgba(34, 197, 94, 0.35)' }} />
            </View>
            {resolved ? <Field label="Resolved date" value={resolvedDate} onChangeText={setResolvedDate} placeholder="YYYY-MM-DD" /> : null}

            <Pressable
              onPress={pickPhoto}
              style={{ minHeight: 46, borderRadius: 8, borderWidth: 1, borderColor: THEME.colors.border, backgroundColor: THEME.colors.bg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginBottom: 14 }}
            >
              <Camera color={THEME.colors.teal} size={18} />
              <Text style={{ color: THEME.colors.teal, fontWeight: '900' }}>{photo ? 'Change attached photo' : 'Attach photo'}</Text>
            </Pressable>
            {photo ? <Image source={{ uri: photo.uri }} style={{ width: '100%', height: 150, borderRadius: 8, marginBottom: 14 }} resizeMode="cover" /> : null}

            <Pressable onPress={submit} disabled={pending} style={{ height: 52, borderRadius: 8, backgroundColor: THEME.colors.teal, alignItems: 'center', justifyContent: 'center', opacity: pending ? 0.7 : 1, marginBottom: 16 }}>
              {pending ? <ActivityIndicator color={THEME.colors.bg} /> : <Text style={{ color: THEME.colors.bg, fontSize: 16, fontWeight: '900' }}>{symptom ? 'Save Changes' : 'Save Symptom'}</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'number-pad';
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: THEME.colors.muted, fontSize: 13, fontWeight: '900', marginBottom: 8 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={THEME.colors.faint}
        multiline={multiline}
        keyboardType={keyboardType}
        style={{
          minHeight: multiline ? 88 : 48,
          borderWidth: 1,
          borderColor: THEME.colors.border,
          backgroundColor: THEME.colors.bg,
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: multiline ? 10 : 0,
          color: THEME.colors.text,
          textAlignVertical: multiline ? 'top' : 'center'
        }}
      />
    </View>
  );
}
