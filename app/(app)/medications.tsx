import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { Bell, Check, Edit3, PauseCircle, Pill, Plus, SkipForward, Trash2, X, XCircle } from 'lucide-react-native';
import { z } from 'zod';
import { THEME } from '@/lib/constants';
import { queryKeys } from '@/lib/queryKeys';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { medicationService } from '@/services/medication.service';
import { useProfileStore } from '@/store/useProfileStore';
import type { CheckinStatus, MedicationInput, MedicationStatus, MedicationWithTodayCheckin } from '@/types';

const statusOptions: { id: MedicationStatus; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'paused', label: 'Paused' },
  { id: 'discontinued', label: 'Discontinued' },
  { id: 'completed', label: 'Completed' }
];

const medicationSchema = z.object({
  drug_name: z.string().min(2, 'Drug name is required.'),
  dosage: z.string().min(1, 'Dosage is required.'),
  frequency: z.string().min(1, 'Frequency is required.'),
  notes: z.string().optional(),
  status: z.custom<MedicationStatus>((value) => statusOptions.some((status) => status.id === value), 'Choose a status.'),
  refill_date: z.string().optional().refine((value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value), 'Refill date must use YYYY-MM-DD.'),
  reminder_time: z.string().optional().refine((value) => !value || /^([01]\d|2[0-3]):([0-5]\d)$/.test(value), 'Reminder time must use HH:MM in 24-hour time.')
});

export default function MedicationsScreen() {
  const { user } = useAuth();
  const { activeProfileId, familyMembers } = useProfileStore();
  const queryClient = useQueryClient();
  const userId = user?.id ?? '';
  const activeFamilyMember = familyMembers.find((member) => member.id === activeProfileId);

  const [editingMedication, setEditingMedication] = useState<MedicationWithTodayCheckin | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const medicationsQuery = useQuery({
    queryKey: queryKeys.medications(userId, activeProfileId),
    queryFn: () => medicationService.getMedications(userId, activeProfileId),
    enabled: !!userId
  });

  const invalidateConnectedData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.medications(userId, activeProfileId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(userId, activeProfileId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) })
    ]);
  };

  const createMutation = useMutation({
    mutationFn: (input: MedicationInput) => medicationService.createMedication(userId, activeProfileId, input),
    onSuccess: async () => {
      await invalidateConnectedData();
      setIsFormOpen(false);
      setEditingMedication(null);
    },
    onError: showError
  });

  const updateMutation = useMutation({
    mutationFn: (input: MedicationInput) => {
      if (!editingMedication) throw new Error('No medication selected.');
      return medicationService.updateMedication(editingMedication.id, input);
    },
    onSuccess: async () => {
      await invalidateConnectedData();
      setIsFormOpen(false);
      setEditingMedication(null);
    },
    onError: showError
  });

  const deleteMutation = useMutation({
    mutationFn: (medicationId: string) => medicationService.softDeleteMedication(medicationId),
    onSuccess: invalidateConnectedData,
    onError: showError
  });

  const checkinMutation = useMutation({
    mutationFn: ({ medicationId, status }: { medicationId: string; status: CheckinStatus }) => medicationService.upsertTodayCheckin(userId, medicationId, status),
    onSuccess: invalidateConnectedData,
    onError: showError
  });

  const grouped = useMemo(() => {
    const medications = medicationsQuery.data ?? [];
    return {
      active: medications.filter((medication) => medication.status === 'active'),
      paused: medications.filter((medication) => medication.status !== 'active')
    };
  }, [medicationsQuery.data]);

  const refresh = async () => {
    setRefreshing(true);
    await medicationsQuery.refetch();
    setRefreshing(false);
  };

  const openCreate = () => {
    setEditingMedication(null);
    setIsFormOpen(true);
  };

  const openEdit = (medication: MedicationWithTodayCheckin) => {
    setEditingMedication(medication);
    setIsFormOpen(true);
  };

  const confirmDelete = (medication: MedicationWithTodayCheckin) => {
    Alert.alert('Delete medication?', `"${medication.drug_name}" will be removed from your active medication list.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(medication.id) }
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: THEME.colors.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 112 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={THEME.colors.teal} />}
      >
        <Text style={{ color: THEME.colors.text, fontSize: 30, fontWeight: '900' }}>Medications</Text>
        <Text style={{ color: THEME.colors.teal, fontSize: 13, fontWeight: '800', marginTop: 6 }}>
          {activeFamilyMember?.full_name ?? 'My Vault'}
        </Text>

        {medicationsQuery.isLoading ? (
          <View style={{ paddingVertical: 64, alignItems: 'center' }}>
            <ActivityIndicator color={THEME.colors.teal} size="large" />
            <Text style={{ color: THEME.colors.muted, marginTop: 12 }}>Loading medications...</Text>
          </View>
        ) : medicationsQuery.isError ? (
          <StateCard title="Medications unavailable" body="Connect Supabase env values and run the database migration before testing live medication data." />
        ) : (medicationsQuery.data?.length ?? 0) === 0 ? (
          <StateCard title="No medications yet" body="Add active prescriptions, supplements, refill dates, and reminders here." />
        ) : (
          <View style={{ marginTop: 20, gap: 24 }}>
            <MedicationGroup
              title="Active"
              medications={grouped.active}
              onEdit={openEdit}
              onDelete={confirmDelete}
              onCheckin={(medicationId, status) => checkinMutation.mutate({ medicationId, status })}
            />
            <MedicationGroup
              title="Paused / Completed"
              medications={grouped.paused}
              onEdit={openEdit}
              onDelete={confirmDelete}
              onCheckin={(medicationId, status) => checkinMutation.mutate({ medicationId, status })}
            />
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

      <MedicationFormModal
        visible={isFormOpen}
        medication={editingMedication}
        pending={createMutation.isPending || updateMutation.isPending}
        onClose={() => {
          setIsFormOpen(false);
          setEditingMedication(null);
        }}
        onSubmit={(input) => {
          if (editingMedication) updateMutation.mutate(input);
          else createMutation.mutate(input);
        }}
      />
    </View>
  );
}

function showError(error: Error) {
  Alert.alert('Medication error', error.message);
}

function MedicationGroup({
  title,
  medications,
  onEdit,
  onDelete,
  onCheckin
}: {
  title: string;
  medications: MedicationWithTodayCheckin[];
  onEdit: (medication: MedicationWithTodayCheckin) => void;
  onDelete: (medication: MedicationWithTodayCheckin) => void;
  onCheckin: (medicationId: string, status: CheckinStatus) => void;
}) {
  if (medications.length === 0) return null;
  return (
    <View>
      <Text style={{ color: THEME.colors.text, fontSize: 18, fontWeight: '900', marginBottom: 12 }}>{title}</Text>
      <View style={{ gap: 12 }}>
        {medications.map((medication) => (
          <MedicationCard key={medication.id} medication={medication} onEdit={() => onEdit(medication)} onDelete={() => onDelete(medication)} onCheckin={onCheckin} />
        ))}
      </View>
    </View>
  );
}

function MedicationCard({
  medication,
  onEdit,
  onDelete,
  onCheckin
}: {
  medication: MedicationWithTodayCheckin;
  onEdit: () => void;
  onDelete: () => void;
  onCheckin: (medicationId: string, status: CheckinStatus) => void;
}) {
  const refillWarning = getRefillWarning(medication.refill_date);
  const todayStatus = medication.today_checkin?.status;

  return (
    <View style={{ borderWidth: 1, borderColor: refillWarning ? 'rgba(245, 158, 11, 0.42)' : THEME.colors.border, backgroundColor: THEME.colors.surface, borderRadius: 8, padding: 14 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 212, 170, 0.11)' }}>
          <Pill color={THEME.colors.teal} size={22} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Text style={{ color: THEME.colors.text, fontSize: 17, fontWeight: '900', flex: 1 }}>{medication.drug_name}</Text>
            <StatusBadge status={medication.status} />
          </View>
          <Text style={{ color: THEME.colors.muted, marginTop: 4 }}>{medication.dosage} · {medication.frequency}</Text>
          {medication.notes ? <Text style={{ color: THEME.colors.faint, lineHeight: 19, marginTop: 6 }}>{medication.notes}</Text> : null}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <MiniStat label="30d adherence" value={`${medication.adherence_30d}%`} />
        <MiniStat label="Today" value={todayStatus ? todayStatus.toUpperCase() : 'OPEN'} />
      </View>

      {refillWarning ? (
        <View style={{ marginTop: 12, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.32)', borderRadius: 8, padding: 10, flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: 'rgba(245, 158, 11, 0.08)' }}>
          <Bell color={THEME.colors.amber} size={16} />
          <Text style={{ color: THEME.colors.amber, fontWeight: '800', flex: 1 }}>{refillWarning}</Text>
        </View>
      ) : null}

      {medication.reminder_time ? (
        <View style={{ marginTop: 12, borderWidth: 1, borderColor: 'rgba(0, 212, 170, 0.28)', borderRadius: 8, padding: 10, flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: 'rgba(0, 212, 170, 0.07)' }}>
          <Bell color={THEME.colors.teal} size={16} />
          <Text style={{ color: THEME.colors.teal, fontWeight: '800', flex: 1 }}>
            Daily reminder at {medication.reminder_time.slice(0, 5)}
          </Text>
        </View>
      ) : null}

      {medication.status === 'active' ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <CheckinButton label="Taken" color={THEME.colors.green} icon={<Check color={THEME.colors.green} size={15} />} onPress={() => onCheckin(medication.id, 'taken')} />
          <CheckinButton label="Missed" color={THEME.colors.red} icon={<XCircle color={THEME.colors.red} size={15} />} onPress={() => onCheckin(medication.id, 'missed')} />
          <CheckinButton label="Skip" color={THEME.colors.faint} icon={<SkipForward color={THEME.colors.faint} size={15} />} onPress={() => onCheckin(medication.id, 'skipped')} />
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <ActionButton label="Edit" icon={<Edit3 color={THEME.colors.teal} size={15} />} onPress={onEdit} />
        <ActionButton label="Delete" icon={<Trash2 color={THEME.colors.red} size={15} />} onPress={onDelete} danger />
      </View>
    </View>
  );
}

function StatusBadge({ status }: { status: MedicationStatus }) {
  const color = status === 'active' ? THEME.colors.green : status === 'paused' ? THEME.colors.amber : THEME.colors.faint;
  return (
    <View style={{ borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: `${color}22` }}>
      <Text style={{ color, fontSize: 10, fontWeight: '900' }}>{status.toUpperCase()}</Text>
    </View>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, borderWidth: 1, borderColor: THEME.colors.border, borderRadius: 8, padding: 10, backgroundColor: THEME.colors.bg }}>
      <Text style={{ color: THEME.colors.text, fontSize: 17, fontWeight: '900' }}>{value}</Text>
      <Text style={{ color: THEME.colors.faint, fontSize: 11, fontWeight: '800', marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function CheckinButton({ label, icon, color, onPress }: { label: string; icon: React.ReactNode; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1, minHeight: 38, borderRadius: 8, borderWidth: 1, borderColor: `${color}55`, backgroundColor: `${color}12`, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 }}>
      {icon}
      <Text style={{ color, fontWeight: '900', fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

function ActionButton({ label, icon, onPress, danger }: { label: string; icon: React.ReactNode; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1, height: 38, borderRadius: 8, borderWidth: 1, borderColor: danger ? 'rgba(239, 68, 68, 0.35)' : THEME.colors.border, backgroundColor: danger ? 'rgba(239, 68, 68, 0.08)' : THEME.colors.elevated, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
      {icon}
      <Text style={{ color: danger ? THEME.colors.red : THEME.colors.teal, fontWeight: '900', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

function StateCard({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ marginTop: 22, borderWidth: 1, borderColor: THEME.colors.border, backgroundColor: THEME.colors.surface, borderRadius: 8, padding: 18, alignItems: 'center' }}>
      <Pill color={THEME.colors.teal} size={24} />
      <Text style={{ color: THEME.colors.text, fontSize: 17, fontWeight: '900', marginTop: 10 }}>{title}</Text>
      <Text style={{ color: THEME.colors.muted, lineHeight: 20, textAlign: 'center', marginTop: 6 }}>{body}</Text>
    </View>
  );
}

function MedicationFormModal({
  visible,
  medication,
  pending,
  onClose,
  onSubmit
}: {
  visible: boolean;
  medication: MedicationWithTodayCheckin | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: MedicationInput) => void;
}) {
  const [drugName, setDrugName] = useState(medication?.drug_name ?? '');
  const [dosage, setDosage] = useState(medication?.dosage ?? '');
  const [frequency, setFrequency] = useState(medication?.frequency ?? '');
  const [status, setStatus] = useState<MedicationStatus>(medication?.status ?? 'active');
  const [refillDate, setRefillDate] = useState(medication?.refill_date ?? '');
  const [reminderTime, setReminderTime] = useState(medication?.reminder_time ?? '');
  const [notes, setNotes] = useState(medication?.notes ?? '');

  useMemo(() => {
    setDrugName(medication?.drug_name ?? '');
    setDosage(medication?.dosage ?? '');
    setFrequency(medication?.frequency ?? '');
    setStatus(medication?.status ?? 'active');
    setRefillDate(medication?.refill_date ?? '');
    setReminderTime(medication?.reminder_time ?? '');
    setNotes(medication?.notes ?? '');
  }, [medication, visible]);

  const submit = () => {
    const parsed = medicationSchema.safeParse({
      drug_name: drugName,
      dosage,
      frequency,
      notes,
      status,
      refill_date: refillDate || undefined,
      reminder_time: reminderTime || undefined
    });
    if (!parsed.success) {
      Alert.alert('Check medication details', parsed.error.issues[0]?.message ?? 'Invalid medication.');
      return;
    }
    onSubmit(parsed.data);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.45)' }}>
        <View style={{ maxHeight: '90%', backgroundColor: THEME.colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: THEME.colors.border, padding: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ color: THEME.colors.text, fontSize: 20, fontWeight: '900', flex: 1 }}>{medication ? 'Edit medication' : 'Add medication'}</Text>
            <Pressable onPress={onClose}>
              <X color={THEME.colors.muted} size={22} />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Field label="Drug name" value={drugName} onChangeText={setDrugName} placeholder="e.g. Metformin" />
            <Field label="Dosage" value={dosage} onChangeText={setDosage} placeholder="e.g. 500mg" />
            <Field label="Frequency" value={frequency} onChangeText={setFrequency} placeholder="e.g. Twice daily after meals" />
            <Text style={{ color: THEME.colors.muted, fontSize: 13, fontWeight: '900', marginBottom: 8 }}>Status</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {statusOptions.map((item) => (
                  <StatusChip key={item.id} label={item.label} active={status === item.id} onPress={() => setStatus(item.id)} />
                ))}
              </View>
            </ScrollView>
            <Field label="Refill date" value={refillDate} onChangeText={setRefillDate} placeholder="YYYY-MM-DD" />
            <Field label="Reminder time" value={reminderTime} onChangeText={setReminderTime} placeholder="HH:MM" />
            <Text style={{ color: THEME.colors.faint, lineHeight: 18, marginTop: -6, marginBottom: 14 }}>
              Set a 24-hour time like 08:30 to receive a daily Android reminder. Refill alerts are scheduled from the refill date.
            </Text>
            <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Instructions, side effects, doctor notes..." multiline />
            <Pressable onPress={submit} disabled={pending} style={{ height: 52, borderRadius: 8, backgroundColor: THEME.colors.teal, alignItems: 'center', justifyContent: 'center', opacity: pending ? 0.7 : 1, marginBottom: 16 }}>
              {pending ? <ActivityIndicator color={THEME.colors.bg} /> : <Text style={{ color: THEME.colors.bg, fontSize: 16, fontWeight: '900' }}>{medication ? 'Save Changes' : 'Save Medication'}</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function StatusChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ height: 36, paddingHorizontal: 13, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? THEME.colors.teal : THEME.colors.bg, borderWidth: 1, borderColor: active ? THEME.colors.teal : THEME.colors.border }}>
      <Text style={{ color: active ? THEME.colors.bg : THEME.colors.muted, fontWeight: '900', fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

function Field({ label, value, onChangeText, placeholder, multiline }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; multiline?: boolean }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: THEME.colors.muted, fontSize: 13, fontWeight: '900', marginBottom: 8 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={THEME.colors.faint}
        multiline={multiline}
        style={{ minHeight: multiline ? 88 : 48, borderWidth: 1, borderColor: THEME.colors.border, backgroundColor: THEME.colors.bg, borderRadius: 8, paddingHorizontal: 12, paddingVertical: multiline ? 10 : 0, color: THEME.colors.text, textAlignVertical: multiline ? 'top' : 'center' }}
      />
    </View>
  );
}

function getRefillWarning(refillDate: string | null) {
  if (!refillDate) return null;
  const days = differenceInCalendarDays(parseISO(refillDate), new Date());
  if (days < 0) return `Refill overdue since ${formatDate(refillDate)}`;
  if (days <= 7) return `Refill due in ${days} day${days === 1 ? '' : 's'}`;
  return null;
}
