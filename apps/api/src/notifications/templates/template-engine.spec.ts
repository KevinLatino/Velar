import {
  severityForEvent,
  templateIdForEvent,
} from './event-template-map';
import { StaticTemplateEngine } from './template-engine';

const engine = new StaticTemplateEngine();

const FIXTURE_DATA: Record<string, Record<string, unknown>> = {
  'bond.created': {
    tokenId: 'BONO-001',
    currentOwner: 'Partido Demo',
    issuerPartyId: 'party-1',
  },
  'bond.congelado': { tokenId: 'BONO-001', currentOwner: 'Partido Demo' },
  'bond.activo': { tokenId: 'BONO-001', currentOwner: 'Partido Demo' },
  'bond.en_venta': { tokenId: 'BONO-001', currentOwner: 'Partido Demo' },
  'bond.aprobado': { tokenId: 'BONO-001' },
  'bond.rechazado': { tokenId: 'BONO-001', reason: 'Documentación incompleta' },
  'transfer.requested': {
    bondTokenId: 'BONO-001',
    fromOwner: 'Comprador A',
    toOwner: 'Emisor B',
  },
  'transfer.aceptada': { bondTokenId: 'BONO-001', fromOwner: 'Comprador A' },
  'transfer.rechazada': { bondTokenId: 'BONO-001' },
  'transfer.en_escrow': { bondTokenId: 'BONO-001' },
  'transfer.pago_registrado': { bondTokenId: 'BONO-001' },
  'transfer.pago_validado': { bondTokenId: 'BONO-001' },
  'transfer.liberada': { bondTokenId: 'BONO-001', toOwner: 'Comprador A' },
  'transfer.cancelada': { bondTokenId: 'BONO-001' },
  'report.enviado': { reportId: 'rep-1', partyId: 'party-1' },
  'report.revisado': { reportId: 'rep-1', partyId: 'party-1' },
  'report.observado': { reportId: 'rep-1', partyId: 'party-1' },
  'report.aprobado': { reportId: 'rep-1', partyId: 'party-1' },
  'notification.generic': { eventType: 'custom.unknown.event' },
};

const TEMPLATE_IDS = Object.keys(FIXTURE_DATA);
const LOCALES = ['es', 'en'] as const;

describe('StaticTemplateEngine', () => {
  for (const templateId of TEMPLATE_IDS) {
    for (const locale of LOCALES) {
      it(`snapshot ${templateId} / ${locale}`, () => {
        const data = FIXTURE_DATA[templateId];
        const once = engine.render({ templateId, locale, data });
        const twice = engine.render({ templateId, locale, data });
        expect(once).toEqual(twice);
        expect(once).toMatchSnapshot();
      });
    }
  }

  it('strips XSS payloads from interpolated body fields', () => {
    const { body } = engine.render({
      templateId: 'bond.created',
      locale: 'es',
      data: {
        tokenId: 'BONO-XSS',
        currentOwner: '<script>alert(1)</script><img src=x onerror=alert(1)>',
      },
    });
    expect(body).not.toContain('<script>');
    expect(body).not.toContain('onerror=');
    expect(body).not.toMatch(/<img\b/i);
  });

  it('A/B variant transfer.requested control vs b produce different subjects', () => {
    const data = FIXTURE_DATA['transfer.requested'];
    const control = engine.render({
      templateId: 'transfer.requested',
      locale: 'es',
      variant: 'control',
      data,
    });
    const b = engine.render({
      templateId: 'transfer.requested',
      locale: 'es',
      variant: 'b',
      data,
    });
    expect(control.subject).not.toEqual(b.subject);
    expect(control.subject).toBe('Nueva oferta recibida');
    expect(b.subject).toContain('Acción requerida');
  });
});

describe('templateIdForEvent / severityForEvent', () => {
  it('maps known event types 1:1 and falls back to notification.generic', () => {
    expect(templateIdForEvent('bond.congelado')).toBe('bond.congelado');
    expect(templateIdForEvent('transfer.requested')).toBe('transfer.requested');
    expect(templateIdForEvent('report.aprobado')).toBe('report.aprobado');
    expect(templateIdForEvent('totally.unknown')).toBe('notification.generic');
    expect(templateIdForEvent('bond.emitido')).toBe('notification.generic');
  });

  it('assigns severity by transition kind', () => {
    expect(severityForEvent('bond.rechazado')).toBe('critical');
    expect(severityForEvent('transfer.rechazada')).toBe('critical');
    expect(severityForEvent('transfer.cancelada')).toBe('critical');
    expect(severityForEvent('report.observado')).toBe('warning');
    expect(severityForEvent('bond.created')).toBe('info');
    expect(severityForEvent('transfer.aceptada')).toBe('info');
    expect(severityForEvent('unknown')).toBe('info');
  });
});
