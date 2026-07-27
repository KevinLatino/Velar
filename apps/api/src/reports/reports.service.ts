import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuditEventType, NotificationType, Role, type CreateReportRequest } from '@velar/types';
import { AuditService } from '../audit/audit.service';
import { SupabaseService } from '../common/supabase/supabase.service';
import { NotificationsService } from '../notifications/notifications.service';

const AUTHORITY: Role[] = ['tse', 'admin'];

export type CreateReportInput = CreateReportRequest;

@Injectable()
export class ReportsService {
  constructor(
    private supabase: SupabaseService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  private async tseUserIds(): Promise<string[]> {
    const { data } = await this.supabase.admin
      .from('profiles')
      .select('id')
      .eq('role', 'tse');
    return (data ?? []).map((p: any) => p.id);
  }

  async create(input: CreateReportInput, actorId: string, partyId: string | null) {
    if (!partyId) throw new ForbiddenException('Solo partidos pueden enviar reportes');
    if (!input.title?.trim() || !input.description?.trim()) {
      throw new BadRequestException('Título y descripción son obligatorios');
    }
    const { data, error } = await this.supabase.admin
      .from('reports')
      .insert({
        party_id: partyId,
        submitted_by: actorId,
        title: input.title.trim(),
        description: input.description.trim(),
        period_start: input.period_start ?? null,
        period_end: input.period_end ?? null,
        bond_token_ids: input.bond_token_ids ?? null,
        total_amount: input.total_amount ?? null,
        status: 'enviado',
      })
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);

    await this.audit.emit({
      type: AuditEventType.REPORT_SUBMITTED,
      actorId,
      payload: { reportId: data.id, partyId },
    });
    for (const tseId of await this.tseUserIds()) {
      await this.notifications.emit(tseId, NotificationType.REPORT_SUBMITTED, {
        reportId: data.id,
        partyId,
      });
    }
    return data;
  }

  /** Lista reportes: TSE/admin ven todos; partido ve solo los suyos. */
  async list(actorId: string, role: Role, partyId: string | null) {
    let q = this.supabase.admin
      .from('reports')
      .select('*, parties(id, name, code), submitter:profiles!reports_submitted_by_fkey(full_name)')
      .order('created_at', { ascending: false });

    if (!AUTHORITY.includes(role)) {
      if (!partyId) return [];
      q = q.eq('party_id', partyId);
    }
    const { data } = await q;
    return data ?? [];
  }

  async findOne(id: string, actorId: string, role: Role, partyId: string | null) {
    const { data, error } = await this.supabase.admin
      .from('reports')
      .select('*, parties(*), submitter:profiles!reports_submitted_by_fkey(full_name, email), reviewer:profiles!reports_reviewed_by_fkey(full_name)')
      .eq('id', id)
      .single();
    if (error || !data) throw new NotFoundException('Reporte no encontrado');
    if (!AUTHORITY.includes(role) && data.party_id !== partyId) {
      throw new ForbiddenException('No autorizado');
    }
    return data;
  }

  /** El TSE marca el reporte como revisado/observado/aprobado. */
  async review(id: string, status: 'revisado' | 'observado' | 'aprobado', notes: string | undefined, actorId: string, role: Role) {
    if (!AUTHORITY.includes(role)) throw new ForbiddenException('Solo TSE puede revisar reportes');
    if (!['revisado', 'observado', 'aprobado'].includes(status)) {
      throw new BadRequestException('Status inválido');
    }
    const { data, error } = await this.supabase.admin
      .from('reports')
      .update({
        status,
        tse_notes: notes ?? null,
        reviewed_by: actorId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);

    const auditType =
      status === 'observado'
        ? AuditEventType.REPORT_OBSERVED
        : status === 'aprobado'
          ? AuditEventType.REPORT_APPROVED
          : AuditEventType.REPORT_VERSION_CREATED;
    await this.audit.emit({
      type: auditType,
      actorId,
      payload: { reportId: id, status, notes: notes ?? null },
    });
    const notifType =
      status === 'observado'
        ? NotificationType.REPORT_OBSERVED
        : status === 'aprobado'
          ? NotificationType.REPORT_APPROVED
          : NotificationType.REPORT_SUBMITTED;
    await this.notifications.emit(data.submitted_by, notifType, {
      reportId: id,
      status,
    });
    return data;
  }
}
