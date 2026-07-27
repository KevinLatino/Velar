import { z } from 'zod';
import { NotificationType } from '../notification';
import { idSchema } from './common';

export const notificationRowSchema = z.object({
  id: idSchema,
  user_id: idSchema,
  type: z.nativeEnum(NotificationType),
  payload: z.record(z.string(), z.unknown()),
  read: z.boolean(),
  created_at: z.string(),
}).passthrough();

export const notificationsResponseSchema = z.object({
  notifications: z.array(notificationRowSchema),
  unreadCount: z.number().int().nonnegative(),
});

const notificationCategorySchema = z.enum([
  'bond',
  'transfer',
  'payment',
  'report',
  'escrow',
  'system',
]);

const notificationChannelKindSchema = z.enum(['in_app', 'email', 'web_push']);

const digestCadenceSchema = z.enum(['instant', 'daily', 'weekly']);

const notificationSeveritySchema = z.enum(['info', 'warning', 'critical']);

export const inboxQuerySchema = z.object({
  category: notificationCategorySchema.optional(),
  severity: notificationSeveritySchema.optional(),
  read: z.enum(['true', 'false']).optional(),
  archived: z.enum(['true', 'false']).optional(),
  search: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
}).passthrough();

export const inboxResponseSchema = z.object({
  notifications: z.array(notificationRowSchema),
  nextCursor: z.string().nullable(),
});

export const bulkReadRequestSchema = z.object({
  ids: z.array(idSchema).min(1).max(200),
}).strict();

export const groupedCountsResponseSchema = z.record(z.string(), z.number().int().nonnegative());

export const channelPreferenceRequestSchema = z.object({
  category: notificationCategorySchema,
  channel: notificationChannelKindSchema,
  enabled: z.boolean(),
}).strict();

export const quietHoursRequestSchema = z.object({
  timezone: z.string().min(1),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(0).max(1439),
  days: z.array(z.number().int().min(0).max(6)),
}).strict();

export const digestSettingRequestSchema = z.object({
  category: notificationCategorySchema,
  cadence: digestCadenceSchema,
}).strict();

export const userNotificationPreferencesResponseSchema = z.object({
  userId: idSchema,
  channelPreferences: z.array(z.object({
    category: notificationCategorySchema,
    channel: notificationChannelKindSchema,
    enabled: z.boolean(),
  })),
  quietHours: z.object({
    timezone: z.string().min(1),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(0).max(1439),
    days: z.array(z.number().int().min(0).max(6)),
  }).nullable(),
  digestSettings: z.array(z.object({
    category: notificationCategorySchema,
    cadence: digestCadenceSchema,
  })),
});

const latencyPercentilesSchema = z.object({
  p50: z.number(),
  p95: z.number(),
  p99: z.number(),
  avg: z.number(),
});

export const metricsSnapshotResponseSchema = z.object({
  emitted: z.record(z.string(), z.number()),
  delivered: z.record(z.string(), z.number()),
  deduped: z.record(z.string(), z.number()),
  failed: z.record(z.string(), z.number()),
  rateLimited: z.record(z.string(), z.number()),
  dlqDepth: z.number().int().nonnegative(),
  latency: z.record(z.string(), latencyPercentilesSchema),
});
