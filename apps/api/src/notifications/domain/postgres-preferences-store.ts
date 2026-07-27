import { Injectable } from '@nestjs/common';
import type {
  ChannelPreference,
  DigestSetting,
  NotificationCategory,
  NotificationChannelKind,
  QuietHours,
  UserNotificationPreferences,
} from '@velar/types';
import { SupabaseService } from '../../common/supabase/supabase.service';
import type { PreferencesStore } from './preferences.interface';

@Injectable()
export class PostgresPreferencesStore implements PreferencesStore {
  constructor(private readonly supabase: SupabaseService) {}

  async getForUser(userId: string): Promise<UserNotificationPreferences> {
    const [prefsRes, quietRes, digestRes] = await Promise.all([
      this.supabase.admin
        .from('notification_preferences')
        .select('category, channel, enabled')
        .eq('user_id', userId),
      this.supabase.admin
        .from('notification_quiet_hours')
        .select('timezone, start_minute, end_minute, days')
        .eq('user_id', userId)
        .maybeSingle(),
      this.supabase.admin
        .from('notification_digest_settings')
        .select('category, cadence')
        .eq('user_id', userId),
    ]);

    if (prefsRes.error) {
      throw new Error(
        `PostgresPreferencesStore preferences: ${prefsRes.error.message}`,
      );
    }
    if (quietRes.error) {
      throw new Error(
        `PostgresPreferencesStore quiet hours: ${quietRes.error.message}`,
      );
    }
    if (digestRes.error) {
      throw new Error(
        `PostgresPreferencesStore digest settings: ${digestRes.error.message}`,
      );
    }

    const channelPreferences: ChannelPreference[] = (prefsRes.data ?? []).map(
      (row: {
        category: string;
        channel: string;
        enabled: boolean;
      }) => ({
        category: row.category as NotificationCategory,
        channel: row.channel as NotificationChannelKind,
        enabled: row.enabled,
      }),
    );

    let quietHours: QuietHours | null = null;
    if (quietRes.data) {
      const q = quietRes.data as {
        timezone: string;
        start_minute: number;
        end_minute: number;
        days: number[];
      };
      quietHours = {
        timezone: q.timezone,
        startMinute: q.start_minute,
        endMinute: q.end_minute,
        days: q.days ?? [],
      };
    }

    const digestSettings: DigestSetting[] = (digestRes.data ?? []).map(
      (row: { category: string; cadence: string }) => ({
        category: row.category as NotificationCategory,
        cadence: row.cadence as DigestSetting['cadence'],
      }),
    );

    return {
      userId,
      channelPreferences,
      quietHours,
      digestSettings,
    };
  }
}
