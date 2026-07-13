export const LAST_PROJECT_KEY = 'jheo.lastProjectId';

export function getLastProjectId(): string | null {
  try {
    return globalThis.localStorage?.getItem(LAST_PROJECT_KEY) ?? null;
  } catch {
    return null;
  }
}

export function setLastProjectId(id: string): void {
  try {
    globalThis.localStorage?.setItem(LAST_PROJECT_KEY, id);
  } catch {
    // localStorage may be unavailable (private mode) — persistence is best-effort.
  }
}
