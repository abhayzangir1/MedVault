import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarDays, Edit3, Plus, Search, Trash2, X } from 'lucide-react-native';
import { z } from 'zod';
import { EVENT_CATEGORIES, THEME } from '@/lib/constants';
import { queryKeys } from '@/lib/queryKeys';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardService } from '@/services/dashboard.service';
import { timelineService } from '@/services/timeline.service';
import { useProfileStore } from '@/store/useProfileStore';
import type { EventCategory, HealthEvent, HealthEventInput } from '@/types';

const eventSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters.'),
  category: z.custom<EventCategory>((value) => EVENT_CATEGORIES.some((category) => category.id === value), 'Choose a category.'),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD.'),
  description: z.string().optional(),
  is_critical: z.boolean()
});

type CategoryFilter = EventCategory | 'all';

export default function TimelineScreen() {
  const { user } = useAuth();
  const { activeProfileId, familyMembers } = useProfileStore();
  const queryClient = useQueryClient();
  const userId = user?.id ?? '';
  const activeFamilyMember = familyMembers.find((member) => member.id === activeProfileId);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [editingEvent, setEditingEvent] = useState<HealthEvent | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const filters = useMemo(() => ({ search, category, criticalOnly }), [category, criticalOnly, search]);

  const timelineQuery = useQuery({
    queryKey: [...queryKeys.timeline(userId, activeProfileId), filters] as const,
    queryFn: () => timelineService.getEvents(userId, activeProfileId, filters),
    enabled: !!userId
  });

  const invalidateConnectedData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.timeline(userId, activeProfileId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(userId, activeProfileId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) })
    ]);
  };

  const createMutation = useMutation({
    mutationFn: (input: HealthEventInput) => timelineService.createEvent(userId, activeProfileId, input),
    onSuccess: async () => {
      await invalidateConnectedData();
      setIsFormOpen(false);
      setEditingEvent(null);
    },
    onError: showError
  });

  const updateMutation = useMutation({
    mutationFn: (input: HealthEventInput) => {
      if (!editingEvent) throw new Error('No event selected.');
      return timelineService.updateEvent(editingEvent.id, input);
    },
    onSuccess: async () => {
      await invalidateConnectedData();
      setIsFormOpen(false);
      setEditingEvent(null);
    },
    onError: showError
  });

  const deleteMutation = useMutation({
    mutationFn: (eventId: string) => timelineService.softDeleteEvent(eventId),
    onSuccess: invalidateConnectedData,
    onError: showError
  });

  const refresh = async () => {
    setRefreshing(true);
    await timelineQuery.refetch();
    setRefreshing(false);
  };

  const openCreate = () => {
    setEditingEvent(null);
    setIsFormOpen(true);
  };

  const openEdit = (event: HealthEvent) => {
    setEditingEvent(event);
    setIsFormOpen(true);
  };

  const confirmDelete = (event: HealthEvent) => {
    Alert.alert('Delete event?', `"${event.title}" will be removed from your timeline.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(event.id) }
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: THEME.colors.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 112 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={THEME.colors.teal} />}
      >
        <Text style={{ color: THEME.colors.text, fontSize: 30, fontWeight: '900' }}>Timeline</Text>
        <Text style={{ color: THEME.colors.teal, fontSize: 13, fontWeight: '800', marginTop: 6 }}>
          {activeFamilyMember?.full_name ?? 'My Vault'}
        </Text>

        <View style={{ marginTop: 18, gap: 12 }}>
          <View style={{ height: 48, borderWidth: 1, borderColor: THEME.colors.border, borderRadius: 8, backgroundColor: THEME.colors.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10 }}>
            <Search color={THEME.colors.faint} size={18} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search event titles"
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
              <FilterChip label="All" active={category === 'all'} onPress={() => setCategory('all')} />
              {EVENT_CATEGORIES.map((item) => (
                <FilterChip key={item.id} label={item.label} active={category === item.id} onPress={() => setCategory(item.id)} />
              ))}
            </View>
          </ScrollView>

          <View style={{ minHeight: 48, borderWidth: 1, borderColor: THEME.colors.border, borderRadius: 8, backgroundColor: THEME.colors.surface, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: THEME.colors.text, fontSize: 14, fontWeight: '800' }}>Critical only</Text>
            <Switch value={criticalOnly} onValueChange={setCriticalOnly} thumbColor={criticalOnly ? THEME.colors.red : THEME.colors.faint} trackColor={{ false: THEME.colors.border, true: 'rgba(239, 68, 68, 0.35)' }} />
          </View>
        </View>

        {timelineQuery.isLoading ? (
          <View style={{ paddingVertical: 64, alignItems: 'center' }}>
            <ActivityIndicator color={THEME.colors.teal} size="large" />
            <Text style={{ color: THEME.colors.muted, marginTop: 12 }}>Loading timeline...</Text>
          </View>
        ) : timelineQuery.isError ? (
          <StateCard title="Timeline unavailable" body="Connect Supabase env values and run the database migration before testing live timeline data." />
        ) : (timelineQuery.data?.length ?? 0) === 0 ? (
          <StateCard title="No events found" body="Add diagnoses, visits, surgeries, vaccines, allergies, and other health events here." />
        ) : (
          <View style={{ gap: 10, marginTop: 20 }}>
            {timelineQuery.data?.map((event) => (
              <EventCard key={event.id} event={event} onEdit={() => openEdit(event)} onDelete={() => confirmDelete(event)} />
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

      <EventFormModal
        visible={isFormOpen}
        event={editingEvent}
        pending={createMutation.isPending || updateMutation.isPending}
        onClose={() => {
          setIsFormOpen(false);
          setEditingEvent(null);
        }}
        onSubmit={(input) => {
          if (editingEvent) updateMutation.mutate(input);
          else createMutation.mutate(input);
        }}
      />
    </View>
  );
}

function showError(error: Error) {
  Alert.alert('Timeline error', error.message);
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
      <Text style={{ color: active ? THEME.colors.bg : THEME.colors.muted, fontWeight: '800', fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

function EventCard({ event, onEdit, onDelete }: { event: HealthEvent; onEdit: () => void; onDelete: () => void }) {
  const categoryLabel = EVENT_CATEGORIES.find((item) => item.id === event.category)?.label ?? 'Other';
  return (
    <View style={{ borderWidth: 1, borderColor: event.is_critical ? 'rgba(239, 68, 68, 0.4)' : THEME.colors.border, borderRadius: 8, backgroundColor: THEME.colors.surface, padding: 14 }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ color: THEME.colors.text, fontSize: 16, fontWeight: '900', flex: 1 }}>{event.title}</Text>
            {event.is_critical ? <AlertTriangle color={THEME.colors.red} size={18} /> : null}
          </View>
          <Text style={{ color: THEME.colors.teal, fontSize: 12, fontWeight: '800', marginTop: 5 }}>
            {categoryLabel} · {formatDate(event.event_date)}
          </Text>
          {event.description ? (
            <Text style={{ color: THEME.colors.muted, lineHeight: 20, marginTop: 8 }}>{event.description}</Text>
          ) : null}
        </View>
      </View>
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
      <Text style={{ color: danger ? THEME.colors.red : THEME.colors.teal, fontWeight: '800', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

function StateCard({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ marginTop: 22, borderWidth: 1, borderColor: THEME.colors.border, backgroundColor: THEME.colors.surface, borderRadius: 8, padding: 18, alignItems: 'center' }}>
      <CalendarDays color={THEME.colors.teal} size={24} />
      <Text style={{ color: THEME.colors.text, fontSize: 17, fontWeight: '900', marginTop: 10 }}>{title}</Text>
      <Text style={{ color: THEME.colors.muted, lineHeight: 20, textAlign: 'center', marginTop: 6 }}>{body}</Text>
    </View>
  );
}

function EventFormModal({
  visible,
  event,
  pending,
  onClose,
  onSubmit
}: {
  visible: boolean;
  event: HealthEvent | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: HealthEventInput) => void;
}) {
  const [title, setTitle] = useState(event?.title ?? '');
  const [category, setCategory] = useState<EventCategory>(event?.category ?? 'consultation');
  const [eventDate, setEventDate] = useState(event?.event_date ?? new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState(event?.description ?? '');
  const [isCritical, setIsCritical] = useState(event?.is_critical ?? false);

  useMemo(() => {
    setTitle(event?.title ?? '');
    setCategory(event?.category ?? 'consultation');
    setEventDate(event?.event_date ?? new Date().toISOString().slice(0, 10));
    setDescription(event?.description ?? '');
    setIsCritical(event?.is_critical ?? false);
  }, [event, visible]);

  const submit = () => {
    const parsed = eventSchema.safeParse({
      title,
      category,
      event_date: eventDate,
      description,
      is_critical: isCritical
    });
    if (!parsed.success) {
      Alert.alert('Check event details', parsed.error.issues[0]?.message ?? 'Invalid event.');
      return;
    }
    onSubmit(parsed.data);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.45)' }}>
        <View style={{ maxHeight: '90%', backgroundColor: THEME.colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: THEME.colors.border, padding: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ color: THEME.colors.text, fontSize: 20, fontWeight: '900', flex: 1 }}>{event ? 'Edit event' : 'Add event'}</Text>
            <Pressable onPress={onClose}>
              <X color={THEME.colors.muted} size={22} />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Annual checkup" />
            <Text style={{ color: THEME.colors.muted, fontSize: 13, fontWeight: '800', marginBottom: 8 }}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {EVENT_CATEGORIES.map((item) => (
                  <FilterChip key={item.id} label={item.label} active={category === item.id} onPress={() => setCategory(item.id)} />
                ))}
              </View>
            </ScrollView>
            <Field label="Date" value={eventDate} onChangeText={setEventDate} placeholder="YYYY-MM-DD" />
            <Field label="Description" value={description} onChangeText={setDescription} placeholder="Notes, doctor, outcome..." multiline />
            <View style={{ minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ color: THEME.colors.text, fontSize: 14, fontWeight: '800' }}>Critical event</Text>
              <Switch value={isCritical} onValueChange={setIsCritical} thumbColor={isCritical ? THEME.colors.red : THEME.colors.faint} trackColor={{ false: THEME.colors.border, true: 'rgba(239, 68, 68, 0.35)' }} />
            </View>
            <Pressable
              onPress={submit}
              disabled={pending}
              style={{ height: 52, borderRadius: 8, backgroundColor: THEME.colors.teal, alignItems: 'center', justifyContent: 'center', opacity: pending ? 0.7 : 1, marginBottom: 16 }}
            >
              {pending ? <ActivityIndicator color={THEME.colors.bg} /> : <Text style={{ color: THEME.colors.bg, fontSize: 16, fontWeight: '900' }}>{event ? 'Save Changes' : 'Save Event'}</Text>}
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
  multiline
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: THEME.colors.muted, fontSize: 13, fontWeight: '800', marginBottom: 8 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={THEME.colors.faint}
        multiline={multiline}
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
