import type { RouteId } from '../i18n/localePath.js';

// Ponytail S4: client-only telemetry ring buffer. No server POST, no PII.
// Storage shape is versioned (v: 1) so future migrations can reject old data.

export const TELEMETRY_STORAGE_KEY = 'jheo.sessionTelemetry.v1';
export const TELEMETRY_MAX_EVENTS = 200;

export type TelemetryEventType = 'page_view' | 'nav_click' | 'api_error';

export type ApiFamily =
  | 'audits'
  | 'projects'
  | 'templates'
  | 'materials'
  | 'fixes'
  | 'channels'
  | 'publishes'
  | 'reports'
  | 'settings'
  | 'gsc'
  | 'other';

interface BaseEvent {
  /** Schema version — bump to invalidate persisted buffers on incompatible changes. */
  v: 1;
  /** Monotonic-ish timestamp in ms (Date.now). */
  t: number;
}

export type TelemetryEvent = BaseEvent &
  (
    | { type: 'page_view'; meta: { routeId: RouteId } }
    | { type: 'nav_click'; meta: { navId: RouteId } }
    | { type: 'api_error'; meta: { status: number; apiFamily: ApiFamily } }
  );

type Listener = (events: TelemetryEvent[]) => void;

const HTTP_PATTERN = /https?:\/\//i;

function hasHttpPayload(ev: TelemetryEvent): boolean {
  // Defensive: any string field under meta must not contain http(s) URLs.
  for (const v of Object.values(ev.meta)) {
    if (typeof v === 'string' && HTTP_PATTERN.test(v)) return true;
  }
  return false;
}

class TelemetryBuffer {
  private events: TelemetryEvent[] = [];
  private listeners = new Set<Listener>();

  constructor() {
    this.load();
  }

  private load(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(TELEMETRY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      this.events = parsed.filter(isValidEvent).slice(-TELEMETRY_MAX_EVENTS);
    } catch {
      this.events = [];
    }
  }

  private persist(): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(TELEMETRY_STORAGE_KEY, JSON.stringify(this.events));
    } catch {
      // storage full / disabled — silently drop, telemetry is best-effort.
    }
    for (const l of this.listeners) l(this.events);
  }

  push(ev: TelemetryEvent): void {
    if (hasHttpPayload(ev)) return; // guard: refuse PII-shaped payloads
    this.events.push(ev);
    if (this.events.length > TELEMETRY_MAX_EVENTS) {
      this.events.splice(0, this.events.length - TELEMETRY_MAX_EVENTS);
    }
    this.persist();
  }

  clear(): void {
    this.events = [];
    this.persist();
  }

  snapshot(): TelemetryEvent[] {
    return [...this.events];
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

function isValidEvent(x: unknown): x is TelemetryEvent {
  if (!x || typeof x !== 'object') return false;
  const e = x as Partial<TelemetryEvent> & { meta?: Record<string, unknown> };
  if (e.v !== 1) return false;
  if (typeof e.t !== 'number') return false;
  if (typeof e.type !== 'string') return false;
  if (!e.meta || typeof e.meta !== 'object') return false;
  switch (e.type) {
    case 'page_view':
      return typeof (e.meta as { routeId?: unknown }).routeId === 'string';
    case 'nav_click':
      return typeof (e.meta as { navId?: unknown }).navId === 'string';
    case 'api_error':
      return (
        typeof (e.meta as { status?: unknown }).status === 'number' &&
        typeof (e.meta as { apiFamily?: unknown }).apiFamily === 'string'
      );
    default:
      return false;
  }
}

let singleton: TelemetryBuffer | null = null;
export function telemetry(): TelemetryBuffer {
  if (!singleton) singleton = new TelemetryBuffer();
  return singleton;
}

// Convenience helpers — keep call sites terse.

export function recordPageView(routeId: RouteId): void {
  telemetry().push({ v: 1, t: Date.now(), type: 'page_view', meta: { routeId } });
}

export function recordNavClick(navId: RouteId): void {
  telemetry().push({ v: 1, t: Date.now(), type: 'nav_click', meta: { navId } });
}

export function recordApiError(status: number, apiFamily: ApiFamily): void {
  telemetry().push({ v: 1, t: Date.now(), type: 'api_error', meta: { status, apiFamily } });
}

/** Map a URL pathname to a coarse API family. Only first segment is read. */
export function apiFamilyFromPath(pathname: string): ApiFamily {
  const seg = pathname.split('/').filter(Boolean)[0] ?? '';
  switch (seg) {
    case 'audits':
    case 'auditorias':
      return 'audits';
    case 'projects':
    case 'projetos':
      return 'projects';
    case 'templates':
    case 'modelos':
      return 'templates';
    case 'materials':
    case 'materiais':
      return 'materials';
    case 'fixes':
    case 'correcoes':
      return 'fixes';
    case 'channels':
    case 'canais':
      return 'channels';
    case 'publishes':
      return 'publishes';
    case 'reports':
    case 'relatorios':
      return 'reports';
    case 'settings':
    case 'configuracoes':
      return 'settings';
    case 'gsc':
      return 'gsc';
    default:
      return 'other';
  }
}
