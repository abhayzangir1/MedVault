import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { Medication } from '@/types';

const MEDICATION_CHANNEL_ID = 'medication-reminders';
const REFILL_CHANNEL_ID = 'refill-alerts';

export const notificationService = {
  configure() {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true
      })
    });
  },

  async ensureAndroidChannels() {
    if (Platform.OS !== 'android') return;

    await Notifications.setNotificationChannelAsync(MEDICATION_CHANNEL_ID, {
      name: 'Medication reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#00d4aa',
      description: 'Daily alerts that remind users to take scheduled medications.'
    });

    await Notifications.setNotificationChannelAsync(REFILL_CHANNEL_ID, {
      name: 'Refill alerts',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#f59e0b',
      description: 'Refill reminders before medication supplies run out.'
    });
  },

  async ensurePermission() {
    await this.ensureAndroidChannels();

    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;

    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  },

  async syncMedicationNotifications(medication: Medication) {
    await this.cancelMedicationNotifications(medication.id);
    if (medication.status !== 'active') return;

    const hasPermission = await this.ensurePermission();
    if (!hasPermission) return;

    const reminderTime = parseReminderTime(medication.reminder_time);
    if (reminderTime) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `Time to take ${medication.drug_name}`,
          body: `${medication.dosage} · ${medication.frequency}`,
          data: {
            feature: 'medications',
            notification_kind: 'daily_medication',
            medication_id: medication.id
          }
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          channelId: MEDICATION_CHANNEL_ID,
          hour: reminderTime.hour,
          minute: reminderTime.minute
        }
      });
    }

    await this.scheduleRefillAlerts(medication);
  },

  async scheduleRefillAlerts(medication: Medication) {
    if (!medication.refill_date) return;

    const refillAt = new Date(`${medication.refill_date}T09:00:00`);
    if (Number.isNaN(refillAt.getTime())) return;

    const weekBefore = new Date(refillAt);
    weekBefore.setDate(refillAt.getDate() - 7);

    await this.scheduleOneTimeNotification({
      date: weekBefore,
      title: `${medication.drug_name} refill soon`,
      body: `Refill is due on ${medication.refill_date}.`,
      medicationId: medication.id,
      kind: 'refill_week_before'
    });

    await this.scheduleOneTimeNotification({
      date: refillAt,
      title: `${medication.drug_name} refill due today`,
      body: 'Check your supply and refill if needed.',
      medicationId: medication.id,
      kind: 'refill_due'
    });
  },

  async scheduleOneTimeNotification(input: {
    date: Date;
    title: string;
    body: string;
    medicationId: string;
    kind: 'refill_week_before' | 'refill_due';
  }) {
    const now = new Date();
    const triggerDate = input.date > now ? input.date : new Date(now.getTime() + 60 * 1000);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: input.title,
        body: input.body,
        data: {
          feature: 'medications',
          notification_kind: input.kind,
          medication_id: input.medicationId
        }
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        channelId: REFILL_CHANNEL_ID,
        date: triggerDate
      }
    });
  },

  async cancelMedicationNotifications(medicationId: string) {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const matching = scheduled.filter((notification) => notification.content.data?.medication_id === medicationId);

    await Promise.all(
      matching.map((notification) => Notifications.cancelScheduledNotificationAsync(notification.identifier))
    );
  },

  async scheduleFeatureNotification(input: {
    title: string;
    body: string;
    feature: 'ai' | 'documents' | 'emergency' | 'general';
    date?: Date;
  }) {
    const hasPermission = await this.ensurePermission();
    if (!hasPermission) return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: input.title,
        body: input.body,
        data: { feature: input.feature }
      },
      trigger: input.date
        ? {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: input.date
          }
        : null
    });
  }
};

function parseReminderTime(value: string | null) {
  if (!value) return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;

  return {
    hour: Number(match[1]),
    minute: Number(match[2])
  };
}
