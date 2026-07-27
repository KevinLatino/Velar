import type {
  NotificationCategory,
  NotificationChannelKind,
  UserNotificationPreferences,
} from '@velar/types';
import type { PreferencesStore } from './preferences.interface';

const ALL_CATEGORIES: NotificationCategory[] = [
  'bond',
  'transfer',
  'payment',
  'report',
  'escrow',
  'system',
];

const ALL_CHANNELS: NotificationChannelKind[] = ['in_app', 'email', 'web_push'];

export function defaultPreferences(userId: string): UserNotificationPreferences {
  return {
    userId,
    channelPreferences: ALL_CATEGORIES.flatMap((category) =>
      ALL_CHANNELS.map((channel) => ({ category, channel, enabled: true })),
    ),
    quietHours: null,
    digestSettings: ALL_CATEGORIES.map((category) => ({
      category,
      cadence: 'instant' as const,
    })),
  };
}

export class InMemoryPreferencesStore implements PreferencesStore {
  constructor(
    private readonly seed: Map<string, UserNotificationPreferences> = new Map(),
  ) {}

  async getForUser(userId: string): Promise<UserNotificationPreferences> {
    return this.seed.get(userId) ?? defaultPreferences(userId);
  }
}
