import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@velar/types';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { InMemoryMetricsRecorder } from './observability/in-memory-metrics';
import { NotificationsService } from './notifications.service';
import { METRICS_RECORDER } from './notifications.tokens';

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(
    private notifications: NotificationsService,
    @Inject(METRICS_RECORDER) private metrics: InMemoryMetricsRecorder,
  ) {}

  @Get()
  list(@CurrentUser() user: any) {
    return this.notifications.list(user.id);
  }

  @Get('inbox')
  inbox(
    @CurrentUser() user: any,
    @Query('category') category?: string,
    @Query('severity') severity?: string,
    @Query('read') read?: string,
    @Query('archived') archived?: string,
    @Query('search') search?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notifications.inbox(user.id, {
      category,
      severity,
      read: read === undefined ? undefined : read === 'true',
      archived: archived === undefined ? undefined : archived === 'true',
      search,
      cursor,
      limit: limit !== undefined ? Number(limit) : undefined,
    });
  }

  @Get('grouped')
  grouped(@CurrentUser() user: any) {
    return this.notifications.groupedCounts(user.id);
  }

  @Get('admin/metrics')
  metricsSnapshot(@CurrentUser() user: any) {
    const role: Role = user.profile?.role;
    if (!['tse', 'admin'].includes(role)) {
      throw new ForbiddenException('TSE/Admin only');
    }
    return this.metrics.snapshot();
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: any) {
    return this.notifications.markAllRead(user.id);
  }

  @Patch('bulk-read')
  bulkRead(@Body() body: { ids: string[] }, @CurrentUser() user: any) {
    return this.notifications.bulkMarkRead(user.id, body.ids);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: any) {
    return this.notifications.markRead(id, user.id);
  }

  @Patch(':id/archive')
  archive(@Param('id') id: string, @CurrentUser() user: any) {
    return this.notifications.archive(id, user.id);
  }

  @Patch(':id/unarchive')
  unarchive(@Param('id') id: string, @CurrentUser() user: any) {
    return this.notifications.unarchive(id, user.id);
  }
}
