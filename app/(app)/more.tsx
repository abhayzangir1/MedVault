import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { Brain, CalendarClock, FileArchive, FileText, HeartPulse, Pill, QrCode, ReceiptText, Share2, Stethoscope, UsersRound } from 'lucide-react-native';
import { THEME } from '@/lib/constants';

const plannedFeatures = [
  { title: 'Timeline', phase: 'Phase 5', icon: CalendarClock },
  { title: 'Medications', phase: 'Phase 6', icon: Pill },
  { title: 'Labs + AI', phase: 'Phase 7', icon: Stethoscope },
  { title: 'Documents + OCR', phase: 'Phase 8', icon: FileText },
  { title: 'Symptoms', phase: 'Phase 9', icon: HeartPulse, href: '/(app)/symptoms' },
  { title: 'Costs', phase: 'Phase 10', icon: ReceiptText, href: '/(app)/costs' },
  { title: 'Care Profiles', phase: 'Phase 11', icon: UsersRound, href: '/(app)/care-profiles' },
  { title: 'Data Packet Builder', phase: 'Phase 12', icon: FileArchive, href: '/(app)/data-packet-builder' },
  { title: 'Doctor Packet', phase: 'Phase 13', icon: Stethoscope, href: '/(app)/doctor-packet' },
  { title: 'Smart Import', phase: 'Phase 14', icon: Brain, href: '/(app)/smart-import' },
  { title: 'Share Links + Emergency ID', phase: 'Phase 15', icon: Share2, href: '/(app)/share-emergency' },
  { title: 'Export', phase: 'Phase 16', icon: FileArchive, href: '/(app)/export' },
  { title: 'Monthly Family Digest', phase: 'Phase 17', icon: QrCode, href: '/(app)/monthly-digest' }
];

export default function MoreScreen() {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: THEME.colors.bg }}
      contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 110 }}
    >
      <Text style={{ color: THEME.colors.text, fontSize: 30, fontWeight: '800' }}>More</Text>
      <Text style={{ color: THEME.colors.muted, lineHeight: 22, marginTop: 8, marginBottom: 18 }}>
        These native Android feature slices are connected around care profiles, selected data packets, doctor-ready sharing, and family care.
      </Text>

      <View style={{ gap: 10 }}>
        {plannedFeatures.map((feature) => {
          const Icon = feature.icon;
          return (
            <Pressable
              key={feature.title}
              onPress={() => {
                if ('href' in feature && feature.href) router.push(feature.href as Href);
              }}
              style={{
                minHeight: 62,
                borderWidth: 1,
                borderColor: THEME.colors.border,
                borderRadius: 8,
                backgroundColor: THEME.colors.surface,
                paddingHorizontal: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                opacity: 'href' in feature && feature.href ? 1 : 0.78
              }}
            >
              <Icon color={THEME.colors.faint} size={20} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: THEME.colors.text, fontSize: 15, fontWeight: '800' }}>{feature.title}</Text>
                <Text style={{ color: THEME.colors.faint, fontSize: 12, marginTop: 2 }}>{feature.phase}</Text>
              </View>
              <Text style={{ color: 'href' in feature && feature.href ? THEME.colors.teal : THEME.colors.faint, fontSize: 12, fontWeight: '800' }}>
                {'href' in feature && feature.href ? 'OPEN' : 'PLANNED'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
