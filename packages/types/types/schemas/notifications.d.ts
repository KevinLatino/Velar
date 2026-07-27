import { z } from 'zod';
export declare const notificationRowSchema: z.ZodObject<{
    id: z.ZodString;
    user_id: z.ZodString;
    type: z.ZodEnum<{
        readonly OFFER_RECEIVED: "offer_received";
        readonly OFFER_ACCEPTED: "offer_accepted";
        readonly OFFER_REJECTED: "offer_rejected";
        readonly COUNTER_OFFER_RECEIVED: "counter_offer_received";
        readonly PAYMENT_CONFIRMED: "payment_confirmed";
        readonly BOND_APPROVED: "bond_approved";
        readonly BOND_REJECTED: "bond_rejected";
        readonly BOND_REQUEST_RECEIVED: "bond_request_received";
        readonly REPORT_SUBMITTED: "report_submitted";
        readonly REPORT_OBSERVED: "report_observed";
        readonly REPORT_APPROVED: "report_approved";
        readonly REPORT_RESUBMITTED: "report_resubmitted";
    }>;
    payload: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    read: z.ZodBoolean;
    created_at: z.ZodString;
}, z.core.$loose>;
export declare const notificationsResponseSchema: z.ZodObject<{
    notifications: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        user_id: z.ZodString;
        type: z.ZodEnum<{
            readonly OFFER_RECEIVED: "offer_received";
            readonly OFFER_ACCEPTED: "offer_accepted";
            readonly OFFER_REJECTED: "offer_rejected";
            readonly COUNTER_OFFER_RECEIVED: "counter_offer_received";
            readonly PAYMENT_CONFIRMED: "payment_confirmed";
            readonly BOND_APPROVED: "bond_approved";
            readonly BOND_REJECTED: "bond_rejected";
            readonly BOND_REQUEST_RECEIVED: "bond_request_received";
            readonly REPORT_SUBMITTED: "report_submitted";
            readonly REPORT_OBSERVED: "report_observed";
            readonly REPORT_APPROVED: "report_approved";
            readonly REPORT_RESUBMITTED: "report_resubmitted";
        }>;
        payload: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        read: z.ZodBoolean;
        created_at: z.ZodString;
    }, z.core.$loose>>;
    unreadCount: z.ZodNumber;
}, z.core.$strip>;
export declare const inboxQuerySchema: z.ZodObject<{
    category: z.ZodOptional<z.ZodEnum<{
        bond: "bond";
        transfer: "transfer";
        payment: "payment";
        report: "report";
        escrow: "escrow";
        system: "system";
    }>>;
    severity: z.ZodOptional<z.ZodEnum<{
        info: "info";
        warning: "warning";
        critical: "critical";
    }>>;
    read: z.ZodOptional<z.ZodEnum<{
        true: "true";
        false: "false";
    }>>;
    archived: z.ZodOptional<z.ZodEnum<{
        true: "true";
        false: "false";
    }>>;
    search: z.ZodOptional<z.ZodString>;
    cursor: z.ZodOptional<z.ZodString>;
    limit: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
}, z.core.$loose>;
export declare const inboxResponseSchema: z.ZodObject<{
    notifications: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        user_id: z.ZodString;
        type: z.ZodEnum<{
            readonly OFFER_RECEIVED: "offer_received";
            readonly OFFER_ACCEPTED: "offer_accepted";
            readonly OFFER_REJECTED: "offer_rejected";
            readonly COUNTER_OFFER_RECEIVED: "counter_offer_received";
            readonly PAYMENT_CONFIRMED: "payment_confirmed";
            readonly BOND_APPROVED: "bond_approved";
            readonly BOND_REJECTED: "bond_rejected";
            readonly BOND_REQUEST_RECEIVED: "bond_request_received";
            readonly REPORT_SUBMITTED: "report_submitted";
            readonly REPORT_OBSERVED: "report_observed";
            readonly REPORT_APPROVED: "report_approved";
            readonly REPORT_RESUBMITTED: "report_resubmitted";
        }>;
        payload: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        read: z.ZodBoolean;
        created_at: z.ZodString;
    }, z.core.$loose>>;
    nextCursor: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const bulkReadRequestSchema: z.ZodObject<{
    ids: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export declare const groupedCountsResponseSchema: z.ZodRecord<z.ZodString, z.ZodNumber>;
export declare const channelPreferenceRequestSchema: z.ZodObject<{
    category: z.ZodEnum<{
        bond: "bond";
        transfer: "transfer";
        payment: "payment";
        report: "report";
        escrow: "escrow";
        system: "system";
    }>;
    channel: z.ZodEnum<{
        email: "email";
        in_app: "in_app";
        web_push: "web_push";
    }>;
    enabled: z.ZodBoolean;
}, z.core.$strict>;
export declare const quietHoursRequestSchema: z.ZodObject<{
    timezone: z.ZodString;
    startMinute: z.ZodNumber;
    endMinute: z.ZodNumber;
    days: z.ZodArray<z.ZodNumber>;
}, z.core.$strict>;
export declare const digestSettingRequestSchema: z.ZodObject<{
    category: z.ZodEnum<{
        bond: "bond";
        transfer: "transfer";
        payment: "payment";
        report: "report";
        escrow: "escrow";
        system: "system";
    }>;
    cadence: z.ZodEnum<{
        instant: "instant";
        daily: "daily";
        weekly: "weekly";
    }>;
}, z.core.$strict>;
export declare const userNotificationPreferencesResponseSchema: z.ZodObject<{
    userId: z.ZodString;
    channelPreferences: z.ZodArray<z.ZodObject<{
        category: z.ZodEnum<{
            bond: "bond";
            transfer: "transfer";
            payment: "payment";
            report: "report";
            escrow: "escrow";
            system: "system";
        }>;
        channel: z.ZodEnum<{
            email: "email";
            in_app: "in_app";
            web_push: "web_push";
        }>;
        enabled: z.ZodBoolean;
    }, z.core.$strip>>;
    quietHours: z.ZodNullable<z.ZodObject<{
        timezone: z.ZodString;
        startMinute: z.ZodNumber;
        endMinute: z.ZodNumber;
        days: z.ZodArray<z.ZodNumber>;
    }, z.core.$strip>>;
    digestSettings: z.ZodArray<z.ZodObject<{
        category: z.ZodEnum<{
            bond: "bond";
            transfer: "transfer";
            payment: "payment";
            report: "report";
            escrow: "escrow";
            system: "system";
        }>;
        cadence: z.ZodEnum<{
            instant: "instant";
            daily: "daily";
            weekly: "weekly";
        }>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const metricsSnapshotResponseSchema: z.ZodObject<{
    emitted: z.ZodRecord<z.ZodString, z.ZodNumber>;
    delivered: z.ZodRecord<z.ZodString, z.ZodNumber>;
    deduped: z.ZodRecord<z.ZodString, z.ZodNumber>;
    failed: z.ZodRecord<z.ZodString, z.ZodNumber>;
    rateLimited: z.ZodRecord<z.ZodString, z.ZodNumber>;
    dlqDepth: z.ZodNumber;
    latency: z.ZodRecord<z.ZodString, z.ZodObject<{
        p50: z.ZodNumber;
        p95: z.ZodNumber;
        p99: z.ZodNumber;
        avg: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
