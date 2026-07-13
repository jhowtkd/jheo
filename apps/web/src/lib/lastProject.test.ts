import { describe, it, expect, beforeEach } from 'vitest';
import { getLastProjectId, setLastProjectId, LAST_PROJECT_KEY } from './lastProject.js';

describe('lastProject', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when nothing stored', () => {
    expect(getLastProjectId()).toBe(null);
  });

  it('round-trips a project id', () => {
    setLastProjectId('p123');
    expect(getLastProjectId()).toBe('p123');
    expect(localStorage.getItem(LAST_PROJECT_KEY)).toBe('p123');
  });
});
