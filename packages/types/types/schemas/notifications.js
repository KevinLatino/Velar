"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metricsSnapshotResponseSchema = exports.userNotificationPreferencesResponseSchema = exports.digestSettingRequestSchema = exports.quietHoursRequestSchema = exports.channelPreferenceRequestSchema = exports.groupedCountsResponseSchema = exports.bulkReadRequestSchema = exports.inboxResponseSchema = exports.inboxQuerySchema = exports.notificationsResponseSchema = exports.notificationRowSchema = void 0;
const zod_1 = require("zod");
const notification_1 = require("../notification");
const common_1 = require("./common");
exports.notificationRowSchema = zod_1.z.object({
    id: common_1.idSchema,
    user_id: common_1.idSchema,
    type: zod_1.z.nativeEnum(notification_1.NotificationType),
    payload: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    read: zod_1.z.boolean(),
    created_at: zod_1.z.string(),
}).passthrough();
exports.notificationsResponseSchema = zod_1.z.object({
    notifications: zod_1.z.array(exports.notificationRowSchema),
    unreadCount: zod_1.z.number().int().nonnegative(),
});
const notificationCategorySchema = zod_1.z.enum([
    'bond',
    'transfer',
    'payment',
    'report',
    'escrow',
    'system',
]);
const notificationChannelKindSchema = zod_1.z.enum(['in_app', 'email', 'web_push']);
const digestCadenceSchema = zod_1.z.enum(['instant', 'daily', 'weekly']);
const notificationSeveritySchema = zod_1.z.enum(['info', 'warning', 'critical']);
exports.inboxQuerySchema = zod_1.z.object({
    category: notificationCategorySchema.optional(),
    severity: notificationSeveritySchema.optional(),
    read: zod_1.z.enum(['true', 'false']).optional(),
    archived: zod_1.z.enum(['true', 'false']).optional(),
    search: zod_1.z.string().optional(),
    cursor: zod_1.z.string().optional(),
    limit: zod_1.z.coerce.number().int().min(1).max(100).optional(),
}).passthrough();
exports.inboxResponseSchema = zod_1.z.object({
    notifications: zod_1.z.array(exports.notificationRowSchema),
    nextCursor: zod_1.z.string().nullable(),
});
exports.bulkReadRequestSchema = zod_1.z.object({
    ids: zod_1.z.array(common_1.idSchema).min(1).max(200),
}).strict();
exports.groupedCountsResponseSchema = zod_1.z.record(zod_1.z.string(), zod_1.z.number().int().nonnegative());
exports.channelPreferenceRequestSchema = zod_1.z.object({
    category: notificationCategorySchema,
    channel: notificationChannelKindSchema,
    enabled: zod_1.z.boolean(),
}).strict();
exports.quietHoursRequestSchema = zod_1.z.object({
    timezone: zod_1.z.string().min(1),
    startMinute: zod_1.z.number().int().min(0).max(1439),
    endMinute: zod_1.z.number().int().min(0).max(1439),
    days: zod_1.z.array(zod_1.z.number().int().min(0).max(6)),
}).strict();
exports.digestSettingRequestSchema = zod_1.z.object({
    category: notificationCategorySchema,
    cadence: digestCadenceSchema,
}).strict();
exports.userNotificationPreferencesResponseSchema = zod_1.z.object({
    userId: common_1.idSchema,
    channelPreferences: zod_1.z.array(zod_1.z.object({
        category: notificationCategorySchema,
        channel: notificationChannelKindSchema,
        enabled: zod_1.z.boolean(),
    })),
    quietHours: zod_1.z.object({
        timezone: zod_1.z.string().min(1),
        startMinute: zod_1.z.number().int().min(0).max(1439),
        endMinute: zod_1.z.number().int().min(0).max(1439),
        days: zod_1.z.array(zod_1.z.number().int().min(0).max(6)),
    }).nullable(),
    digestSettings: zod_1.z.array(zod_1.z.object({
        category: notificationCategorySchema,
        cadence: digestCadenceSchema,
    })),
});
const latencyPercentilesSchema = zod_1.z.object({
    p50: zod_1.z.number(),
    p95: zod_1.z.number(),
    p99: zod_1.z.number(),
    avg: zod_1.z.number(),
});
exports.metricsSnapshotResponseSchema = zod_1.z.object({
    emitted: zod_1.z.record(zod_1.z.string(), zod_1.z.number()),
    delivered: zod_1.z.record(zod_1.z.string(), zod_1.z.number()),
    deduped: zod_1.z.record(zod_1.z.string(), zod_1.z.number()),
    failed: zod_1.z.record(zod_1.z.string(), zod_1.z.number()),
    rateLimited: zod_1.z.record(zod_1.z.string(), zod_1.z.number()),
    dlqDepth: zod_1.z.number().int().nonnegative(),
    latency: zod_1.z.record(zod_1.z.string(), latencyPercentilesSchema),
});
