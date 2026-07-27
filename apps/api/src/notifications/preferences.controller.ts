import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import type {
  DigestCadence,
  NotificationCategory,
  NotificationChannelKind,
} from '@velar/types';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PreferencesService } from './preferences.service';

@Controller('notifications/preferences')
@UseGuards(AuthGuard)
export class PreferencesController {
  constructor(private preferences: PreferencesService) {}

  @Get()
  get(@CurrentUser() user: any) {
    return this.preferences.getForUser(user.id);
  }

  @Patch('channels')
  upsertChannel(
    @Body()
    body: {
      category: NotificationCategory;
      channel: NotificationChannelKind;
      enabled: boolean;
    },
    @CurrentUser() user: any,
  ) {
    return this.preferences.upsertChannel(user.id, body);
  }

  @Patch('quiet-hours')
  upsertQuietHours(
    @Body()
    body: {
      timezone: string;
      startMinute: number;
      endMinute: number;
      days: number[];
    },
    @CurrentUser() user: any,
  ) {
    return this.preferences.upsertQuietHours(user.id, body);
  }

  @Patch('digest')
  upsertDigest(
    @Body() body: { category: NotificationCategory; cadence: DigestCadence },
    @CurrentUser() user: any,
  ) {
    return this.preferences.upsertDigest(user.id, body);
  }
}
