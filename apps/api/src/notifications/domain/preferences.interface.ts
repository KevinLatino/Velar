import type { UserNotificationPreferences } from '@velar/types';

export interface PreferencesStore {
  getForUser(userId: string): Promise<UserNotificationPreferences>;
}
