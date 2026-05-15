import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Edit3, Plus, ReceiptText, Search, Trash2, X } from 'lucide-react-native';
import { z } from 'zod';
import { COST_CATEGORIES, REIMBURSEMENT_STATUSES, THEME } from '@/lib/constants';
import { queryKeys } from '@/lib/queryKeys';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { costService } from '@/services/cost.service';
import type { CostFilters, PickedCostReceipt } from '@/services/cost.service';
import { useProfileStore } from '@/store/useProfileStore';
import type { CostCategory, HealthcareCost, HealthcareCostInput, ReimbursementStatus } from '@/types';

const costSchema = z.object({
  amount: z.string().refine((value) => Number(value) > 0, 'Amount must be greater than 0.'),
  cost_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD.'),
  category: z.custom<CostCategory>((value) => COST_CATEGORIES.some((category) => category.id === value), 'Choose a category.'),
  description: z.string().optional(),
  provider_name: z.string().optional(),
  reimbursement_status: z.custom<ReimbursementStatus>((value) => REIMBURSEMENT_STATUSES.some((status) => status.id === value), 'Choose a reimbursement status.'),
  reimbursement_amount: z.string().optional().refine((value) => !value || Number(value) >= 0, 'Reimbursement amount cannot be negative.')
});

export default function CostsScreen() {
  const { user } = useAuth();
  const { activeCareProfileId, familyMembers } = useProfileStore();
  const queryClient = useQueryClient();
  const userId = user?.id ?? '';
  const activeFamilyMember = familyMembers.find((member) => member.id === activeCareProfileId);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [reimbursement, setReimbursement] = useState<string>('all');
  const [editingCost, setEditingCost] = useState<HealthcareCost | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const filters = useMemo<CostFilters>(() => ({ search, category, reimbursement }), [category, reimbursement, search]);

  const costsQuery = useQuery({
    queryKey: [...queryKeys.costs(userId, activeCareProfileId), filters] as const,
    queryFn: () => costService.getCosts(userId, activeCareProfileId, filters),
    enabled: !!userId
  });

  const costs = costsQuery.data ?? [];
  const totals = useMemo(() => {
    const total = costs.reduce((sum, cost) => sum + cost.amount, 0);
    const reimbursed = costs.reduce((sum, cost) => sum + (cost.reimbursement_amount ?? 0), 0);
    return { total, reimbursed, outOfPocket: Math.max(total - reimbursed, 0), monthly: costService.getMonthlyTotals(costs) };
  }, [costs]);

  const invalidateConnectedData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.costs(userId, activeCareProfileId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(userId, activeCareProfileId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) })
    ]);
  };

  const createMutation = useMutation({
    mutationFn: async ({ input, receipt }: { input: HealthcareCostInput; receipt: PickedCostReceipt | null }) => {
      const cost = await costService.createCost(userId, activeCareProfileId, input);
      if (receipt) await costService.uploadCostReceipt(userId, cost.id, receipt);
      return cost;
    },
    onSuccess: async () => {
      await invalidateConnectedData();
      setIsFormOpen(false);
      setEditingCost(null);
    },
    onError: showError
  });

  const updateMutation = useMutation({
    mutationFn: async ({ input, receipt }: { input: HealthcareCostInput; receipt: PickedCostReceipt | null }) => {
      if (!editingCost) throw new Error('No cost selected.');
      const cost = await costService.updateCost(editingCost.id, input);
      if (receipt) await costService.uploadCostReceipt(userId, cost.id, receipt);
      return cost;
    },
    onSuccess: async () => {
      await invalidateConnectedData();
      setIsFormOpen(false);
      setEditingCost(null);
    },
    onError: showError
  });

  const deleteMutation = useMutation({
    mutationFn: (costId: string) => costService.softDeleteCost(costId),
    onSuccess: invalidateConnectedData,
    onError: showError
  });

  const refresh = async () => {
    setRefreshing(true);
    await costsQuery.refetch();
    setRefreshing(false);
  };

  const openCreate = () => {
    setEditingCost(null);
    setIsFormOpen(true);
  };

  const openEdit = (cost: HealthcareCost) => {
    setEditingCost(cost);
    setIsFormOpen(true);
  };

  const confirmDelete = (cost: HealthcareCost) => {
    Alert.alert('Delete cost?', `${formatMoney(cost.amount)} will be removed from this care profile.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(cost.id) }
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: THEME.colors.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 112 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={THEME.colors.teal} />}
      >
        <Text style={{ color: THEME.colors.text, fontSize: 30, fontWeight: '900' }}>Costs</Text>
        <Text style={{ color: THEME.colors.teal, fontSize: 13, fontWeight: '800', marginTop: 6 }}>
          {activeFamilyMember?.full_name ?? 'My Vault'}
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>
          <Metric label="Total" value={formatMoney(totals.total)} />
          <Metric label="Out of pocket" value={formatMoney(totals.outOfPocket)} />
          <Metric label="Reimbursed" value={formatMoney(totals.reimbursed)} />
          <Metric label="Entries" value={String(costs.length)} />
        </View>

        <TrendCard totals={totals.monthly} />

        <View style={{ marginTop: 18, gap: 12 }}>
          <View style={{ height: 48, borderWidth: 1, borderColor: THEME.colors.border, borderRadius: 8, backgroundColor: THEME.colors.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10 }}>
            <Search color={THEME.colors.faint} size={18} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search provider or description"
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
              {COST_CATEGORIES.map((item) => (
                <FilterChip key={item.id} label={item.label} active={category === item.id} onPress={() => setCategory(item.id)} />
              ))}
            </View>
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <FilterChip label="Any reimbursement" active={reimbursement === 'all'} onPress={() => setReimbursement('all')} />
              {REIMBURSEMENT_STATUSES.map((item) => (
                <FilterChip key={item.id} label={item.label} active={reimbursement === item.id} onPress={() => setReimbursement(item.id)} />
              ))}
            </View>
          </ScrollView>
        </View>

        {costsQuery.isLoading ? (
          <View style={{ paddingVertical: 64, alignItems: 'center' }}>
            <ActivityIndicator color={THEME.colors.teal} size="large" />
            <Text style={{ color: THEME.colors.muted, marginTop: 12 }}>Loading costs...</Text>
          </View>
        ) : costsQuery.isError ? (
          <StateCard title="Costs unavailable" body="Connect Supabase env values and run the latest database migration before testing live cost data." />
        ) : costs.length === 0 ? (
          <StateCard title="No costs found" body="Track consultations, medicine bills, lab fees, insurance reimbursements, and receipts here." />
        ) : (
          <View style={{ gap: 12, marginTop: 20 }}>
            {costs.map((cost) => (
              <CostCard key={cost.id} cost={cost} onEdit={() => openEdit(cost)} onDelete={() => confirmDelete(cost)} />
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

      <CostFormModal
        visible={isFormOpen}
        cost={editingCost}
        pending={createMutation.isPending || updateMutation.isPending}
        onClose={() => {
          setIsFormOpen(false);
          setEditingCost(null);
        }}
        onSubmit={(input, receipt) => {
          if (editingCost) updateMutation.mutate({ input, receipt });
          else createMutation.mutate({ input, receipt });
        }}
      />
    </View>
  );
}

function showError(error: Error) {
  Alert.alert('Cost error', error.message);
}

function formatMoney(value: number) {
  return `INR ${Math.round(value).toLocaleString('en-IN')}`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: '47.8%', minHeight: 84, borderWidth: 1, borderColor: THEME.colors.border, borderRadius: 8, backgroundColor: THEME.colors.surface, padding: 12 }}>
      <Text style={{ color: THEME.colors.text, fontSize: 19, fontWeight: '900' }}>{value}</Text>
      <Text style={{ color: THEME.colors.faint, fontSize: 12, fontWeight: '800', marginTop: 5 }}>{label}</Text>
    </View>
  );
}

function TrendCard({ totals }: { totals: { month: string; total: number; reimbursed: number }[] }) {
  const max = Math.max(...totals.map((item) => item.total), 1);
  return (
    <View style={{ marginTop: 18, borderWidth: 1, borderColor: THEME.colors.border, borderRadius: 8, backgroundColor: THEME.colors.surface, padding: 14 }}>
      <Text style={{ color: THEME.colors.text, fontSize: 16, fontWeight: '900' }}>6-month trend</Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 9, height: 126, marginTop: 12 }}>
        {totals.map((item) => (
          <View key={item.month} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <View style={{ width: '100%', height: Math.max(8, (item.total / max) * 88), borderRadius: 5, backgroundColor: THEME.colors.teal }} />
            <Text style={{ color: THEME.colors.faint, fontSize: 10, fontWeight: '800' }}>{item.month.slice(5)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 13, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? THEME.colors.teal : THEME.colors.surface, borderWidth: 1, borderColor: active ? THEME.colors.teal : THEME.colors.border }}>
      <Text style={{ color: active ? THEME.colors.bg : THEME.colors.muted, fontWeight: '900', fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

function CostCard({ cost, onEdit, onDelete }: { cost: HealthcareCost; onEdit: () => void; onDelete: () => void }) {
  const categoryLabel = COST_CATEGORIES.find((item) => item.id === cost.category)?.label ?? 'Other';
  const statusLabel = REIMBURSEMENT_STATUSES.find((item) => item.id === cost.reimbursement_status)?.label ?? 'N/A';
  const firstPhoto = cost.photos?.[0];

  return (
    <View style={{ borderWidth: 1, borderColor: THEME.colors.border, backgroundColor: THEME.colors.surface, borderRadius: 8, padding: 14 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ width: 48, height: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 212, 170, 0.11)' }}>
          <ReceiptText color={THEME.colors.teal} size={22} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: THEME.colors.text, fontSize: 18, fontWeight: '900' }}>{formatMoney(cost.amount)}</Text>
          <Text style={{ color: THEME.colors.teal, fontSize: 12, fontWeight: '800', marginTop: 4 }}>
            {categoryLabel} · {formatDate(cost.cost_date)}
          </Text>
          <Text style={{ color: THEME.colors.muted, marginTop: 5 }}>
            {cost.provider_name || 'Provider not set'} · {statusLabel}
          </Text>
          {cost.description ? <Text style={{ color: THEME.colors.faint, lineHeight: 19, marginTop: 6 }}>{cost.description}</Text> : null}
        </View>
      </View>
      {firstPhoto ? <Image source={{ uri: firstPhoto.photo_url }} style={{ width: '100%', height: 150, borderRadius: 8, marginTop: 12 }} resizeMode="cover" /> : null}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <ActionButton label="Edit" icon={<Edit3 color={THEME.colors.teal} size={15} />} onPress={onEdit} />
        <ActionButton label="Delete" icon={<Trash2 color={THEME.colors.red} size={15} />} onPress={onDelete} danger />
      </View>
    </View>
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
      <ReceiptText color={THEME.colors.teal} size={24} />
      <Text style={{ color: THEME.colors.text, fontSize: 17, fontWeight: '900', marginTop: 10 }}>{title}</Text>
      <Text style={{ color: THEME.colors.muted, lineHeight: 20, textAlign: 'center', marginTop: 6 }}>{body}</Text>
    </View>
  );
}

function CostFormModal({ visible, cost, pending, onClose, onSubmit }: { visible: boolean; cost: HealthcareCost | null; pending: boolean; onClose: () => void; onSubmit: (input: HealthcareCostInput, receipt: PickedCostReceipt | null) => void }) {
  const [amount, setAmount] = useState(cost ? String(cost.amount) : '');
  const [costDate, setCostDate] = useState(cost?.cost_date ?? new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<CostCategory>(cost?.category ?? 'consultation');
  const [description, setDescription] = useState(cost?.description ?? '');
  const [provider, setProvider] = useState(cost?.provider_name ?? '');
  const [reimbursementStatus, setReimbursementStatus] = useState<ReimbursementStatus>(cost?.reimbursement_status ?? 'not_applicable');
  const [reimbursementAmount, setReimbursementAmount] = useState(cost?.reimbursement_amount ? String(cost.reimbursement_amount) : '');
  const [receipt, setReceipt] = useState<PickedCostReceipt | null>(null);

  useMemo(() => {
    setAmount(cost ? String(cost.amount) : '');
    setCostDate(cost?.cost_date ?? new Date().toISOString().slice(0, 10));
    setCategory(cost?.category ?? 'consultation');
    setDescription(cost?.description ?? '');
    setProvider(cost?.provider_name ?? '');
    setReimbursementStatus(cost?.reimbursement_status ?? 'not_applicable');
    setReimbursementAmount(cost?.reimbursement_amount ? String(cost.reimbursement_amount) : '');
    setReceipt(null);
  }, [cost, visible]);

  const pickReceipt = async () => {
    try {
      const picked = await costService.pickReceipt();
      if (picked) setReceipt(picked);
    } catch (error) {
      showError(error instanceof Error ? error : new Error('Unable to pick receipt.'));
    }
  };

  const submit = () => {
    const parsed = costSchema.safeParse({
      amount,
      cost_date: costDate,
      category,
      description,
      provider_name: provider,
      reimbursement_status: reimbursementStatus,
      reimbursement_amount: reimbursementAmount || undefined
    });
    if (!parsed.success) {
      Alert.alert('Check cost details', parsed.error.issues[0]?.message ?? 'Invalid cost.');
      return;
    }
    onSubmit(parsed.data, receipt);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.45)' }}>
        <View style={{ maxHeight: '90%', backgroundColor: THEME.colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: THEME.colors.border, padding: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ color: THEME.colors.text, fontSize: 20, fontWeight: '900', flex: 1 }}>{cost ? 'Edit cost' : 'Add cost'}</Text>
            <Pressable onPress={onClose}><X color={THEME.colors.muted} size={22} /></Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Field label="Amount" value={amount} onChangeText={setAmount} placeholder="1200" keyboardType="number-pad" />
            <Field label="Date" value={costDate} onChangeText={setCostDate} placeholder="YYYY-MM-DD" />
            <ChipSection label="Category" items={COST_CATEGORIES} value={category} onChange={(value) => setCategory(value as CostCategory)} />
            <Field label="Provider" value={provider} onChangeText={setProvider} placeholder="Hospital, pharmacy, lab..." />
            <Field label="Description" value={description} onChangeText={setDescription} placeholder="Consultation, prescription, test package..." multiline />
            <ChipSection label="Reimbursement" items={REIMBURSEMENT_STATUSES} value={reimbursementStatus} onChange={(value) => setReimbursementStatus(value as ReimbursementStatus)} />
            <Field label="Reimbursement amount" value={reimbursementAmount} onChangeText={setReimbursementAmount} placeholder="0" keyboardType="number-pad" />
            <Pressable onPress={pickReceipt} style={{ minHeight: 46, borderRadius: 8, borderWidth: 1, borderColor: THEME.colors.border, backgroundColor: THEME.colors.bg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              <Camera color={THEME.colors.teal} size={18} />
              <Text style={{ color: THEME.colors.teal, fontWeight: '900' }}>{receipt ? 'Change receipt' : 'Attach receipt'}</Text>
            </Pressable>
            {receipt ? <Image source={{ uri: receipt.uri }} style={{ width: '100%', height: 150, borderRadius: 8, marginBottom: 14 }} resizeMode="cover" /> : null}
            <Pressable onPress={submit} disabled={pending} style={{ height: 52, borderRadius: 8, backgroundColor: THEME.colors.teal, alignItems: 'center', justifyContent: 'center', opacity: pending ? 0.7 : 1, marginBottom: 16 }}>
              {pending ? <ActivityIndicator color={THEME.colors.bg} /> : <Text style={{ color: THEME.colors.bg, fontSize: 16, fontWeight: '900' }}>{cost ? 'Save Changes' : 'Save Cost'}</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ChipSection({ label, items, value, onChange }: { label: string; items: readonly { id: string; label: string }[]; value: string; onChange: (value: string) => void }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: THEME.colors.muted, fontSize: 13, fontWeight: '900', marginBottom: 8 }}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {items.map((item) => <FilterChip key={item.id} label={item.label} active={value === item.id} onPress={() => onChange(item.id)} />)}
        </View>
      </ScrollView>
    </View>
  );
}

function Field({ label, value, onChangeText, placeholder, multiline, keyboardType }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; multiline?: boolean; keyboardType?: 'default' | 'number-pad' }) {
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
        style={{ minHeight: multiline ? 88 : 48, borderWidth: 1, borderColor: THEME.colors.border, backgroundColor: THEME.colors.bg, borderRadius: 8, paddingHorizontal: 12, paddingVertical: multiline ? 10 : 0, color: THEME.colors.text, textAlignVertical: multiline ? 'top' : 'center' }}
      />
    </View>
  );
}
