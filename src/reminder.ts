import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const CHANNEL_ID = 'daily-rate';
const REMINDER_ID = 'daily-rate-reminder';

export type ReminderResult = 'on' | 'off' | 'denied';

export async function isReminderOn(): Promise<boolean> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled.some((n) => n.identifier === REMINDER_ID);
}

/** Schedules a local notification every day at 10:00. No server is involved. */
export async function turnReminderOn(title: string, body: string): Promise<ReminderResult> {
  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return 'denied';

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Daily gold rate',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: { title, body },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 10,
      minute: 0,
      channelId: CHANNEL_ID,
    },
  });
  return 'on';
}

export async function turnReminderOff(): Promise<ReminderResult> {
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID);
  return 'off';
}
