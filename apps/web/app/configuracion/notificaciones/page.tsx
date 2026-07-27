'use client';

import { ReactNode, useCallback, useEffect, useState } from 'react';
import { Bell, Clock, Mail } from 'lucide-react';
import type {
  DigestCadence,
  NotificationCategory,
  NotificationChannelKind,
  QuietHours,
  UserNotificationPreferences,
} from '@velar/types';
import { AppShell } from '../../../components/AppShell';
import { notify } from '../../../components/Toast';
import { apiFetch, type Me } from '../../../lib/api';

const CATEGORIES: NotificationCategory[] = [
  'bond',
  'transfer',
  'payment',
  'report',
  'escrow',
  'system',
];

const CHANNELS: NotificationChannelKind[] = ['in_app', 'email', 'web_push'];

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  bond: 'Bonos',
  transfer: 'Transferencias',
  payment: 'Pagos',
  report: 'Reportes',
  escrow: 'Custodia (escrow)',
  system: 'Sistema',
};

const CHANNEL_LABELS: Record<NotificationChannelKind, string> = {
  in_app: 'En la app',
  email: 'Correo',
  web_push: 'Push web',
};

const CADENCE_LABELS: Record<DigestCadence, string> = {
  instant: 'Instantáneo',
  daily: 'Diario',
  weekly: 'Semanal',
};

/** Curated IANA zones for VELAR markets (country.ts has no timezone mapping). */
const TIMEZONES = [
  { value: 'America/Costa_Rica', label: 'América/Costa Rica' },
  { value: 'America/Bogota', label: 'América/Bogotá' },
  { value: 'America/Sao_Paulo', label: 'América/São Paulo' },
  { value: 'America/Argentina/Buenos_Aires', label: 'América/Buenos Aires' },
  { value: 'UTC', label: 'UTC' },
] as const;

const DAY_LABELS = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const;

function SettingsCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-container/10 text-primary-container">
          {icon}
        </span>
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function minutesToTimeInput(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeInputToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return Math.min(1439, Math.max(0, h * 60 + m));
}

function isChannelEnabled(
  prefs: UserNotificationPreferences | null,
  category: NotificationCategory,
  channel: NotificationChannelKind,
): boolean {
  const row = prefs?.channelPreferences.find(
    (p) => p.category === category && p.channel === channel,
  );
  return row?.enabled ?? true;
}

function digestFor(
  prefs: UserNotificationPreferences | null,
  category: NotificationCategory,
): DigestCadence {
  return prefs?.digestSettings.find((d) => d.category === category)?.cadence ?? 'instant';
}

export default function NotificacionesPreferenciasPage() {
  return <AppShell>{({ token, me }) => <Content token={token} me={me} />}</AppShell>;
}

function Content({ token }: { token: string; me: Me }) {
  const [prefs, setPrefs] = useState<UserNotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timezone, setTimezone] = useState('America/Costa_Rica');
  const [startTime, setStartTime] = useState('22:00');
  const [endTime, setEndTime] = useState('07:00');
  const [days, setDays] = useState<number[]>([]);
  const [savingQuiet, setSavingQuiet] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = (await apiFetch(
        token,
        'GET',
        '/notifications/preferences',
      )) as UserNotificationPreferences;
      setPrefs(data);
      if (data.quietHours) {
        setTimezone(data.quietHours.timezone);
        setStartTime(minutesToTimeInput(data.quietHours.startMinute));
        setEndTime(minutesToTimeInput(data.quietHours.endMinute));
        setDays([...data.quietHours.days]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las preferencias');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleChannel(
    category: NotificationCategory,
    channel: NotificationChannelKind,
    enabled: boolean,
  ) {
    if (!prefs) return;
    const previous = prefs;
    setPrefs({
      ...prefs,
      channelPreferences: (() => {
        const others = prefs.channelPreferences.filter(
          (p) => !(p.category === category && p.channel === channel),
        );
        return [...others, { category, channel, enabled }];
      })(),
    });
    try {
      await apiFetch(token, 'PATCH', '/notifications/preferences/channels', {
        category,
        channel,
        enabled,
      });
    } catch (e: unknown) {
      setPrefs(previous);
      notify.err(e instanceof Error ? e.message : 'No se pudo actualizar el canal');
    }
  }

  async function saveQuietHours() {
    setSavingQuiet(true);
    const body: QuietHours = {
      timezone,
      startMinute: timeInputToMinutes(startTime),
      endMinute: timeInputToMinutes(endTime),
      days: [...days].sort((a, b) => a - b),
    };
    try {
      await apiFetch(token, 'PATCH', '/notifications/preferences/quiet-hours', body);
      setPrefs((prev) => (prev ? { ...prev, quietHours: body } : prev));
      notify.ok('Horario de silencio guardado');
    } catch (e: unknown) {
      notify.err(e instanceof Error ? e.message : 'No se pudo guardar el horario');
    } finally {
      setSavingQuiet(false);
    }
  }

  async function setDigest(category: NotificationCategory, cadence: DigestCadence) {
    if (!prefs) return;
    const previous = prefs;
    setPrefs({
      ...prefs,
      digestSettings: (() => {
        const others = prefs.digestSettings.filter((d) => d.category !== category);
        return [...others, { category, cadence }];
      })(),
    });
    try {
      await apiFetch(token, 'PATCH', '/notifications/preferences/digest', {
        category,
        cadence,
      });
    } catch (e: unknown) {
      setPrefs(previous);
      notify.err(e instanceof Error ? e.message : 'No se pudo actualizar la cadencia');
    }
  }

  function toggleDay(day: number) {
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  const input = 'velar-input mt-1 w-full rounded-xl border px-4 py-2.5 text-sm outline-none';

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-on-surface-variant">
        <span className="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-primary-container border-t-transparent" />
        Cargando preferencias…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-error/30 bg-error-container px-6 py-4 text-sm text-error">
        {error}
        <button
          type="button"
          onClick={() => void load()}
          className="ml-3 font-semibold underline"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <>
      <h1
        className="mb-1 text-3xl font-bold tracking-tight md:text-4xl"
        style={{ fontFamily: 'Geist' }}
      >
        Preferencias de notificaciones
      </h1>
      <p className="mb-6 text-on-surface-variant">
        Elige qué recibir, por qué canal, y cuándo no molestar.
      </p>

      <div className="space-y-6">
        <SettingsCard icon={<Bell size={20} />} title="Categorías y canales">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-outline-variant/30 text-on-surface-variant">
                  <th className="pb-3 pr-4 font-medium">Categoría</th>
                  {CHANNELS.map((ch) => (
                    <th key={ch} className="pb-3 px-2 text-center font-medium">
                      {CHANNEL_LABELS[ch]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CATEGORIES.map((category) => (
                  <tr key={category} className="border-b border-outline-variant/15">
                    <td className="py-3 pr-4 font-medium text-on-surface">
                      {CATEGORY_LABELS[category]}
                    </td>
                    {CHANNELS.map((channel) => {
                      const id = `ch-${category}-${channel}`;
                      const checked = isChannelEnabled(prefs, category, channel);
                      return (
                        <td key={channel} className="px-2 py-3 text-center">
                          <label htmlFor={id} className="inline-flex cursor-pointer items-center justify-center">
                            <span className="sr-only">
                              {CATEGORY_LABELS[category]} — {CHANNEL_LABELS[channel]}
                            </span>
                            <input
                              id={id}
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                void toggleChannel(category, channel, e.target.checked)
                              }
                              className="h-4 w-4 rounded border-outline-variant text-primary-container focus:ring-primary-container"
                            />
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-on-surface-variant">
            Si no hay preferencia explícita, el canal queda habilitado por defecto.
          </p>
        </SettingsCard>

        <SettingsCard icon={<Clock size={20} />} title="Horario de silencio (quiet hours)">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="qh-timezone" className="block text-sm font-medium text-on-surface-variant">
                Zona horaria
              </label>
              <select
                id="qh-timezone"
                className={input}
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="qh-start" className="block text-sm font-medium text-on-surface-variant">
                Inicio
              </label>
              <input
                id="qh-start"
                type="time"
                className={input}
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="qh-end" className="block text-sm font-medium text-on-surface-variant">
                Fin
              </label>
              <input
                id="qh-end"
                type="time"
                className={input}
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <fieldset className="mt-4">
            <legend className="mb-2 text-sm font-medium text-on-surface-variant">
              Días de la semana
            </legend>
            <div className="flex flex-wrap gap-3">
              {DAY_LABELS.map((label, day) => {
                const id = `qh-day-${day}`;
                return (
                  <label
                    key={day}
                    htmlFor={id}
                    className="flex cursor-pointer items-center gap-2 rounded-xl border border-outline-variant/30 px-3 py-2 text-sm"
                  >
                    <input
                      id={id}
                      type="checkbox"
                      checked={days.includes(day)}
                      onChange={() => toggleDay(day)}
                      className="h-4 w-4 rounded border-outline-variant text-primary-container focus:ring-primary-container"
                    />
                    {label}
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-on-surface-variant">
              Sin días seleccionados = todos los días (0 = domingo … 6 = sábado).
            </p>
          </fieldset>

          <button
            type="button"
            onClick={() => void saveQuietHours()}
            disabled={savingQuiet}
            className="velar-primary-button mt-5 rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            {savingQuiet ? 'Guardando…' : 'Guardar horario'}
          </button>
        </SettingsCard>

        <SettingsCard icon={<Mail size={20} />} title="Cadencia de resumen (digest)">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {CATEGORIES.map((category) => {
              const id = `digest-${category}`;
              const value = digestFor(prefs, category);
              return (
                <div key={category}>
                  <label htmlFor={id} className="block text-sm font-medium text-on-surface-variant">
                    {CATEGORY_LABELS[category]}
                  </label>
                  <select
                    id={id}
                    className={input}
                    value={value}
                    onChange={(e) => void setDigest(category, e.target.value as DigestCadence)}
                  >
                    {(Object.keys(CADENCE_LABELS) as DigestCadence[]).map((c) => (
                      <option key={c} value={c}>
                        {CADENCE_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </SettingsCard>
      </div>
    </>
  );
}
