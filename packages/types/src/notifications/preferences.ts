export type NotificationCategory = 'bond' | 'transfer' | 'payment' | 'report' | 'escrow' | 'system';
export type NotificationChannelKind = 'in_app' | 'email' | 'web_push';
export type DigestCadence = 'instant' | 'daily' | 'weekly';

export interface ChannelPreference {
  category: NotificationCategory;
  channel: NotificationChannelKind;
  enabled: boolean;
}

export interface QuietHours {
  timezone: string; // IANA tz name e.g. 'America/Costa_Rica'
  startMinute: number; // 0-1439, minutes from local midnight
  endMinute: number;   // may be < startMinute meaning an overnight window
  days: number[];      // 0=Sunday..6=Saturday; empty array means every day
}

export interface DigestSetting {
  category: NotificationCategory;
  cadence: DigestCadence;
}

export interface UserNotificationPreferences {
  userId: string;
  channelPreferences: ChannelPreference[];
  quietHours: QuietHours | null;
  digestSettings: DigestSetting[];
}
