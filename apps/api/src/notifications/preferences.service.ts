import { Inject, Injectable } from '@nestjs/common';
import type {
  DigestCadence,
  NotificationCategory,
  NotificationChannelKind,
  UserNotificationPreferences,
} from '@velar/types';
import { SupabaseService } from '../common/supabase/supabase.service';
import type { PreferencesStore } from './domain/preferences.interface';
import { PREFERENCES_STORE } from './notifications.tokens';

@Injectable()
export class PreferencesService {
  constructor(
    @Inject(PREFERENCES_STORE) private readonly store: PreferencesStore,
    private readonly supabase: SupabaseService,
  ) {}

  getForUser(userId: string): Promise<UserNotificationPreferences> {
    return this.store.getForUser(userId);
  }

  async upsertChannel(
    userId: string,
    input: {
      category: NotificationCategory;
      channel: NotificationChannelKind;
      enabled: boolean;
    },
  ) {
    await this.supabase.admin.from('notification_preferences').upsert(
      {
        user_id: userId,
        category: input.category,
        channel: input.channel,
        enabled: input.enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,category,channel' },
    );
    return { ok: true as const };
  }

  async upsertQuietHours(
    userId: string,
    input: {
      timezone: string;
      startMinute: number;
      endMinute: number;
      days: number[];
    },
  ) {
    await this.supabase.admin.from('notification_quiet_hours').upsert(
      {
        user_id: userId,
        timezone: input.timezone,
        start_minute: input.startMinute,
        end_minute: input.endMinute,
        days: input.days,
      },
      { onConflict: 'user_id' },
    );
    return { ok: true as const };
  }

  async upsertDigest(
    userId: string,
    input: { category: NotificationCategory; cadence: DigestCadence },
  ) {
    await this.supabase.admin.from('notification_digest_settings').upsert(
      {
        user_id: userId,
        category: input.category,
        cadence: input.cadence,
      },
      { onConflict: 'user_id,category' },
    );
    return { ok: true as const };
  }
}
