import { z } from 'zod';
import { requiredStringSchema } from './common';

export const perspectiveSchema = z.enum(['usuario', 'partido'], { error: 'validation.enum' });

export const loginRequestSchema = z.object({
  email: requiredStringSchema.email('validation.email'),
  password: requiredStringSchema,
}).strict();

export const registerRequestSchema = z.object({
  email: requiredStringSchema.email('validation.email'),
  password: requiredStringSchema.min(8, 'validation.password'),
  perspectiva: perspectiveSchema,
  nombres: z.string().trim().optional(),
  apellidos: z.string().trim().optional(),
  identificacion: z.string().trim().optional(),
  telefono: z.string().trim().optional(),
  direccion: z.string().trim().optional(),
  nombrePartido: z.string().trim().optional(),
  codigo: z.string().trim().optional(),
  representanteLegal: z.string().trim().optional(),
  cedulaJuridica: z.string().trim().optional(),
}).strict().superRefine((value, context) => {
  if (value.perspectiva === 'usuario') {
    if (!value.nombres) context.addIssue({ code: z.ZodIssueCode.custom, path: ['nombres'], message: 'validation.required' });
    if (!value.apellidos) context.addIssue({ code: z.ZodIssueCode.custom, path: ['apellidos'], message: 'validation.required' });
    if (!value.identificacion) context.addIssue({ code: z.ZodIssueCode.custom, path: ['identificacion'], message: 'validation.required' });
  }
  if (value.perspectiva === 'partido') {
    if (!value.nombrePartido) context.addIssue({ code: z.ZodIssueCode.custom, path: ['nombrePartido'], message: 'validation.partyFields' });
    if (!value.codigo) context.addIssue({ code: z.ZodIssueCode.custom, path: ['codigo'], message: 'validation.partyFields' });
  }
});

export const registerResponseSchema = z.object({
  id: requiredStringSchema,
  email: requiredStringSchema.email(),
  role: z.enum(['comprador', 'emisor']),
  perspectiva: perspectiveSchema,
  partyId: z.string().nullable(),
  wallet: z.string().nullable(),
}).passthrough();

export const loginResponseSchema = z.object({
  access_token: requiredStringSchema,
  refresh_token: requiredStringSchema,
  expires_in: z.number().positive(),
  token_type: requiredStringSchema,
  user: z.unknown(),
}).passthrough();

/* ─── Ciclo de vida de la cuenta (issue #77) ───────────────────────────────── */

export const forgotPasswordRequestSchema = z.object({
  email: requiredStringSchema.email('validation.email'),
}).strict();

export const resetPasswordRequestSchema = z.object({
  /** `token_hash` del enlace de recuperación que Supabase envía por correo. */
  tokenHash: requiredStringSchema,
  password: requiredStringSchema.min(8, 'validation.password'),
}).strict();

export const changeEmailRequestSchema = z.object({
  email: requiredStringSchema.email('validation.email'),
}).strict();

/**
 * Respuesta uniforme de `forgot-password`. Es intencionalmente opaca: se
 * devuelve lo mismo exista o no la cuenta, para no filtrar qué correos están
 * registrados (enumeración de usuarios).
 */
export const forgotPasswordResponseSchema = z.object({
  ok: z.literal(true),
}).strict();

export const accountStatusResponseSchema = z.object({
  ok: z.literal(true),
  userId: requiredStringSchema,
  active: z.boolean(),
}).strict();

export type LoginRequest = z.input<typeof loginRequestSchema>;
export type RegisterRequest = z.input<typeof registerRequestSchema>;
export type RegisterResponse = z.output<typeof registerResponseSchema>;
export type ForgotPasswordRequest = z.input<typeof forgotPasswordRequestSchema>;
export type ResetPasswordRequest = z.input<typeof resetPasswordRequestSchema>;
export type ChangeEmailRequest = z.input<typeof changeEmailRequestSchema>;
export type ForgotPasswordResponse = z.output<typeof forgotPasswordResponseSchema>;
export type AccountStatusResponse = z.output<typeof accountStatusResponseSchema>;
