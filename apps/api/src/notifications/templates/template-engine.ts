import type {
  TemplateEngine,
  TemplateRenderInput,
  TemplateRenderOutput,
} from '../domain/template.interface';
import { sanitizeHtml } from './sanitize';

type TemplateFns = {
  subject: (data: Record<string, unknown>) => string;
  body: (data: Record<string, unknown>) => string;
};

type TemplateRegistry = Record<
  string,
  Record<string, Record<string, TemplateFns>>
>;

function str(data: Record<string, unknown>, key: string): string {
  const v = data[key];
  if (v == null) return '';
  return String(v);
}

function bondRef(data: Record<string, unknown>): string {
  return str(data, 'tokenId') || str(data, 'bondTokenId') || str(data, 'bondId');
}

function partyRef(data: Record<string, unknown>): string {
  return (
    str(data, 'partyName') ||
    str(data, 'currentOwner') ||
    str(data, 'fromOwner') ||
    str(data, 'toOwner') ||
    str(data, 'partyId')
  );
}

function localePair(
  es: TemplateFns,
  en: TemplateFns,
): Record<string, Record<string, TemplateFns>> {
  return {
    es: { control: es },
    en: { control: en },
  };
}

const REGISTRY: TemplateRegistry = {
  'bond.created': localePair(
    {
      subject: () => 'Bono emitido',
      body: (d) =>
        `<p>Se emitió el bono <strong>${bondRef(d)}</strong>${partyRef(d) ? ` para ${partyRef(d)}` : ''}.</p>`,
    },
    {
      subject: () => 'Bond issued',
      body: (d) =>
        `<p>Bond <strong>${bondRef(d)}</strong> was issued${partyRef(d) ? ` for ${partyRef(d)}` : ''}.</p>`,
    },
  ),

  'bond.congelado': localePair(
    {
      subject: () => 'Bono congelado',
      body: (d) =>
        `<p>El bono <strong>${bondRef(d)}</strong> fue congelado y no puede transferirse.</p>`,
    },
    {
      subject: () => 'Bond frozen',
      body: (d) =>
        `<p>Bond <strong>${bondRef(d)}</strong> was frozen and cannot be transferred.</p>`,
    },
  ),

  'bond.activo': localePair(
    {
      subject: () => 'Bono activo',
      body: (d) =>
        `<p>El bono <strong>${bondRef(d)}</strong> está activo nuevamente.</p>`,
    },
    {
      subject: () => 'Bond active',
      body: (d) =>
        `<p>Bond <strong>${bondRef(d)}</strong> is active again.</p>`,
    },
  ),

  'bond.en_venta': localePair(
    {
      subject: () => 'Bono publicado en el mercado',
      body: (d) =>
        `<p>El bono <strong>${bondRef(d)}</strong> fue publicado en el mercado.</p>`,
    },
    {
      subject: () => 'Bond published to marketplace',
      body: (d) =>
        `<p>Bond <strong>${bondRef(d)}</strong> was published to the marketplace.</p>`,
    },
  ),

  'bond.aprobado': localePair(
    {
      subject: () => 'Bono aprobado',
      body: (d) =>
        `<p>El bono <strong>${bondRef(d)}</strong> fue aprobado.</p>`,
    },
    {
      subject: () => 'Bond approved',
      body: (d) =>
        `<p>Bond <strong>${bondRef(d)}</strong> was approved.</p>`,
    },
  ),

  'bond.rechazado': localePair(
    {
      subject: () => 'Bono rechazado',
      body: (d) => {
        const reason = str(d, 'reason');
        return `<p>La solicitud del bono <strong>${bondRef(d)}</strong> fue rechazada.${reason ? ` Motivo: ${reason}` : ''}</p>`;
      },
    },
    {
      subject: () => 'Bond rejected',
      body: (d) => {
        const reason = str(d, 'reason');
        return `<p>Bond request for <strong>${bondRef(d)}</strong> was rejected.${reason ? ` Reason: ${reason}` : ''}</p>`;
      },
    },
  ),

  'transfer.requested': {
    es: {
      control: {
        subject: () => 'Nueva oferta recibida',
        body: (d) =>
          `<p>Recibiste una nueva oferta${bondRef(d) ? ` por el bono <strong>${bondRef(d)}</strong>` : ''}${str(d, 'fromOwner') ? ` de ${str(d, 'fromOwner')}` : ''}.</p>`,
      },
      b: {
        subject: () => '¡Acción requerida: nueva oferta pendiente!',
        body: (d) =>
          `<p><em>Urgente:</em> tienes una oferta pendiente${bondRef(d) ? ` sobre el bono <strong>${bondRef(d)}</strong>` : ''}. Revísala pronto.</p>`,
      },
    },
    en: {
      control: {
        subject: () => 'New offer received',
        body: (d) =>
          `<p>You received a new offer${bondRef(d) ? ` for bond <strong>${bondRef(d)}</strong>` : ''}${str(d, 'fromOwner') ? ` from ${str(d, 'fromOwner')}` : ''}.</p>`,
      },
      b: {
        subject: () => 'Action needed: new offer pending!',
        body: (d) =>
          `<p><em>Urgent:</em> you have a pending offer${bondRef(d) ? ` on bond <strong>${bondRef(d)}</strong>` : ''}. Review it soon.</p>`,
      },
    },
  },

  'transfer.aceptada': localePair(
    {
      subject: () => 'Oferta aceptada',
      body: (d) =>
        `<p>Tu oferta${bondRef(d) ? ` por el bono <strong>${bondRef(d)}</strong>` : ''} fue aceptada.</p>`,
    },
    {
      subject: () => 'Offer accepted',
      body: (d) =>
        `<p>Your offer${bondRef(d) ? ` for bond <strong>${bondRef(d)}</strong>` : ''} was accepted.</p>`,
    },
  ),

  'transfer.rechazada': localePair(
    {
      subject: () => 'Oferta rechazada',
      body: (d) =>
        `<p>Tu oferta${bondRef(d) ? ` por el bono <strong>${bondRef(d)}</strong>` : ''} fue rechazada.</p>`,
    },
    {
      subject: () => 'Offer rejected',
      body: (d) =>
        `<p>Your offer${bondRef(d) ? ` for bond <strong>${bondRef(d)}</strong>` : ''} was rejected.</p>`,
    },
  ),

  'transfer.en_escrow': localePair(
    {
      subject: () => 'Fondos en garantía (escrow)',
      body: (d) =>
        `<p>El bono <strong>${bondRef(d)}</strong> quedó en garantía (escrow) mientras se completa la transferencia.</p>`,
    },
    {
      subject: () => 'Funds in escrow',
      body: (d) =>
        `<p>Bond <strong>${bondRef(d)}</strong> is held in escrow while the transfer completes.</p>`,
    },
  ),

  'transfer.pago_registrado': localePair(
    {
      subject: () => 'Pago registrado',
      body: (d) =>
        `<p>Se registró el pago${bondRef(d) ? ` del bono <strong>${bondRef(d)}</strong>` : ''}. Pendiente de validación.</p>`,
    },
    {
      subject: () => 'Payment registered',
      body: (d) =>
        `<p>Payment was registered${bondRef(d) ? ` for bond <strong>${bondRef(d)}</strong>` : ''}. Awaiting validation.</p>`,
    },
  ),

  'transfer.pago_validado': localePair(
    {
      subject: () => 'Pago validado',
      body: (d) =>
        `<p>El pago${bondRef(d) ? ` del bono <strong>${bondRef(d)}</strong>` : ''} fue validado.</p>`,
    },
    {
      subject: () => 'Payment confirmed',
      body: (d) =>
        `<p>Payment${bondRef(d) ? ` for bond <strong>${bondRef(d)}</strong>` : ''} was confirmed.</p>`,
    },
  ),

  'transfer.liberada': localePair(
    {
      subject: () => 'Bono transferido',
      body: (d) =>
        `<p>El bono <strong>${bondRef(d)}</strong> fue liberado${str(d, 'toOwner') ? ` a ${str(d, 'toOwner')}` : ' al nuevo propietario'}.</p>`,
    },
    {
      subject: () => 'Bond released to new owner',
      body: (d) =>
        `<p>Bond <strong>${bondRef(d)}</strong> was released${str(d, 'toOwner') ? ` to ${str(d, 'toOwner')}` : ' to the new owner'}.</p>`,
    },
  ),

  'transfer.cancelada': localePair(
    {
      subject: () => 'Transferencia cancelada',
      body: (d) =>
        `<p>La transferencia${bondRef(d) ? ` del bono <strong>${bondRef(d)}</strong>` : ''} fue cancelada.</p>`,
    },
    {
      subject: () => 'Transfer cancelled',
      body: (d) =>
        `<p>The transfer${bondRef(d) ? ` of bond <strong>${bondRef(d)}</strong>` : ''} was cancelled.</p>`,
    },
  ),

  'report.enviado': localePair(
    {
      subject: () => 'Reporte enviado',
      body: (d) =>
        `<p>El reporte <strong>${str(d, 'reportId')}</strong> fue enviado al TSE.</p>`,
    },
    {
      subject: () => 'Report submitted',
      body: (d) =>
        `<p>Report <strong>${str(d, 'reportId')}</strong> was submitted to the TSE.</p>`,
    },
  ),

  'report.revisado': localePair(
    {
      subject: () => 'Reporte revisado',
      body: (d) =>
        `<p>El reporte <strong>${str(d, 'reportId')}</strong> fue revisado.</p>`,
    },
    {
      subject: () => 'Report reviewed',
      body: (d) =>
        `<p>Report <strong>${str(d, 'reportId')}</strong> was reviewed.</p>`,
    },
  ),

  'report.observado': localePair(
    {
      subject: () => 'Reporte con observaciones',
      body: (d) =>
        `<p>El reporte <strong>${str(d, 'reportId')}</strong> tiene observaciones del TSE. Revísalo y corrige lo indicado.</p>`,
    },
    {
      subject: () => 'Report has feedback',
      body: (d) =>
        `<p>Report <strong>${str(d, 'reportId')}</strong> has feedback from the TSE. Review and address the notes.</p>`,
    },
  ),

  'report.aprobado': localePair(
    {
      subject: () => 'Reporte aprobado',
      body: (d) =>
        `<p>El reporte <strong>${str(d, 'reportId')}</strong> fue aprobado.</p>`,
    },
    {
      subject: () => 'Report approved',
      body: (d) =>
        `<p>Report <strong>${str(d, 'reportId')}</strong> was approved.</p>`,
    },
  ),

  'notification.generic': localePair(
    {
      subject: () => 'Actualización',
      body: (d) =>
        `<p>${str(d, 'eventType') || 'Actualización del sistema'}</p>`,
    },
    {
      subject: () => 'Update',
      body: (d) =>
        `<p>${str(d, 'eventType') || 'System update'}</p>`,
    },
  ),

  'notification.digest': localePair(
    {
      subject: () => 'Resumen de notificaciones',
      body: (d) => {
        const items = Array.isArray(d.items) ? d.items : [];
        const lines = items
          .map((item) => {
            const text =
              typeof item === 'string'
                ? item
                : item &&
                    typeof item === 'object' &&
                    'subject' in (item as object)
                  ? String((item as { subject: unknown }).subject)
                  : String(item ?? '');
            return `<p>• ${text}</p>`;
          })
          .join('');
        return `<p>Resumen de notificaciones:</p>${lines}`;
      },
    },
    {
      subject: () => 'Notification digest',
      body: (d) => {
        const items = Array.isArray(d.items) ? d.items : [];
        const lines = items
          .map((item) => {
            const text =
              typeof item === 'string'
                ? item
                : item &&
                    typeof item === 'object' &&
                    'subject' in (item as object)
                  ? String((item as { subject: unknown }).subject)
                  : String(item ?? '');
            return `<p>• ${text}</p>`;
          })
          .join('');
        return `<p>Notification digest:</p>${lines}`;
      },
    },
  ),
};

export class StaticTemplateEngine implements TemplateEngine {
  constructor(private readonly registry: TemplateRegistry = REGISTRY) {}

  render(input: TemplateRenderInput): TemplateRenderOutput {
    const byLocale = this.registry[input.templateId];
    if (!byLocale) {
      throw new Error(`Unknown templateId: ${input.templateId}`);
    }
    const localeEntry = byLocale[input.locale] ?? byLocale['es'];
    if (!localeEntry) {
      throw new Error(
        `No locale entry for templateId=${input.templateId} locale=${input.locale}`,
      );
    }
    const variant = input.variant ?? 'control';
    const fns = localeEntry[variant] ?? localeEntry['control'];
    if (!fns) {
      throw new Error(
        `No variant for templateId=${input.templateId} locale=${input.locale} variant=${variant}`,
      );
    }
    const subject = String(fns.subject(input.data));
    const body = sanitizeHtml(fns.body(input.data));
    return { subject, body };
  }
}
