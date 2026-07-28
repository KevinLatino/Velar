export type NotificationCategory = 'bond' | 'transfer' | 'payment' | 'report' | 'escrow' | 'system';
export type NotificationChannelKind = 'in_app' | 'email' | 'web_push';
export type DigestCadence = 'instant' | 'daily' | 'weekly';
export interface ChannelPreference {
    category: NotificationCategory;
    channel: NotificationChannelKind;
    enabled: boolean;
}
export interface QuietHours {
    timezone: string;
    startMinute: number;
    endMinute: number;
    days: number[];
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
