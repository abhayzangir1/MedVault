import * as Haptics from 'expo-haptics';

export const hapticsService = {
  selection() {
    void Haptics.selectionAsync();
  },

  success() {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },

  warning() {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  },

  error() {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }
};
