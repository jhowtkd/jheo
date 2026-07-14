import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { telemetry, type TelemetryEvent } from '../telemetry/sessionTelemetry.js';

const DISPLAY_LIMIT = 50;

function summarize(events: TelemetryEvent[]) {
  const out = { page_view: 0, nav_click: 0, api_error: 0 } as Record<string, number>;
  for (const e of events) out[e.type] = (out[e.type] ?? 0) + 1;
  return out;
}

function formatTime(t: number): string {
  try {
    return new Date(t).toLocaleString();
  } catch {
    return String(t);
  }
}

function describeEvent(e: TelemetryEvent, t: (k: string) => string): string {
  switch (e.type) {
    case 'page_view':
      return t('telemetry.event.pageView') + ': ' + e.meta.routeId;
    case 'nav_click':
      return t('telemetry.event.navClick') + ': ' + e.meta.navId;
    case 'api_error': {
      return (
        t('telemetry.event.apiError') +
        ': ' +
        t('telemetry.apiFamily.' + e.meta.apiFamily) +
        ' (' +
        e.meta.status +
        ')'
      );
    }
  }
}

export function SessionTelemetryPanel() {
  const { t } = useTranslation();
  const [events, setEvents] = useState<TelemetryEvent[]>([]);

  useEffect(() => {
    setEvents(telemetry().snapshot());
    return telemetry().subscribe(setEvents);
  }, []);

  const counts = useMemo(() => summarize(events), [events]);
  const last = useMemo(() => events.slice(-DISPLAY_LIMIT).reverse(), [events]);

  return (
    <section
      aria-label={t('telemetry.section')}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <span className="tiny muted">
            {t('telemetry.counts.pageView')}: <strong>{counts.page_view ?? 0}</strong>
          </span>
          <span className="tiny muted">
            {t('telemetry.counts.navClick')}: <strong>{counts.nav_click ?? 0}</strong>
          </span>
          <span className="tiny muted">
            {t('telemetry.counts.apiError')}: <strong>{counts.api_error ?? 0}</strong>
          </span>
          <span className="tiny muted">
            {t('telemetry.counts.total')}: <strong>{events.length}</strong>
          </span>
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => telemetry().clear()}
          disabled={events.length === 0}
          style={{ marginLeft: 'auto' }}
        >
          {t('telemetry.clear')}
        </button>
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>
        {t('telemetry.privacyNote')}
      </p>
      {last.length > 0 && (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-1)',
            maxHeight: 240,
            overflow: 'auto',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          {last.map((e, i) => (
            <li
              key={e.t + ':' + i}
              className="tiny"
              style={{
                padding: 'var(--space-2) var(--space-3)',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                gap: 'var(--space-3)',
              }}
            >
              <span>{describeEvent(e, t)}</span>
              <span className="muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatTime(e.t)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
