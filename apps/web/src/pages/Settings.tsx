import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { deleteSetting, listSettings, upsertSetting } from '../api.js';

const PRESETS = [
  { key: 'openai_api_key', label: 'OpenAI API key', hint: 'Used for embeddings + as default completion provider' },
  { key: 'openai_embedding_api_key', label: 'OpenAI embedding key', hint: 'Separate slot when completion routes through an OpenAI-compatible third party (e.g. MiniMax)' },
  { key: 'anthropic_api_key', label: 'Anthropic API key', hint: 'Completion via Anthropic Claude' },
  { key: 'openrouter_api_key', label: 'OpenRouter API key', hint: 'Completion via OpenRouter (multi-model routing)' },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function maskKey(key: string): string {
  const presets = PRESETS.map((p) => p.key);
  if (presets.includes(key)) {
    return '••••••••••••';
  }
  return '••••••••••••';
}

export function Settings() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['settings'], queryFn: listSettings });
  const [key, setKey] = useState('openai_api_key');
  const [value, setValue] = useState('');
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const put = useMutation({
    mutationFn: () => upsertSetting(key, value),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['settings'] });
      setValue('');
    },
  });
  const del = useMutation({
    mutationFn: (k: string) => deleteSetting(k),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Settings</h1>
          <p className="page__subtitle">
            API keys are encrypted at rest with <code className="mono">JHEO_SECRET_KEY</code> (AES-256-GCM).
            Values are write-only — the API never returns the plaintext over the wire.
          </p>
        </div>
      </div>

      <div className="col" style={{ gap: 'var(--space-6)' }}>
        <section>
          <h2 style={{ fontSize: 'var(--fs-lg)', margin: 0, marginBottom: 'var(--space-3)' }}>Stored keys</h2>
          {list.isLoading && (
            <div className="col" style={{ gap: 'var(--space-2)' }}>
              <div className="skeleton skeleton--row" />
              <div className="skeleton skeleton--row" />
            </div>
          )}
          {list.data && list.data.length === 0 && !list.isLoading && (
            <div className="empty">
              <div className="empty__art">
                <svg viewBox="0 0 56 56">
                  <rect x="14" y="26" width="28" height="20" rx="2" />
                  <path d="M20 26v-6a8 8 0 0 1 16 0v6" />
                  <circle cx="28" cy="36" r="2" />
                </svg>
              </div>
              <p className="empty__title">No keys stored yet</p>
              <p className="empty__hint">
                Add one below. The API will use env-var fallbacks if a key is missing, but
                encrypted Settings rows take precedence and survive across container restarts.
              </p>
            </div>
          )}
          {list.data && list.data.length > 0 && (
            <div className="col" style={{ gap: 'var(--space-2)' }}>
              {list.data.map((s) => {
                const preset = PRESETS.find((p) => p.key === s.key);
                return (
                  <div key={s.key} className="card" style={{ padding: 'var(--space-4) var(--space-5)' }}>
                    <div className="spread" style={{ marginBottom: 'var(--space-2)' }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{preset?.label ?? s.key}</div>
                        <div className="tiny muted" style={{ marginTop: 2 }}>
                          {preset?.hint ?? 'Custom setting'}
                        </div>
                      </div>
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => setReveal((r) => ({ ...r, [s.key]: !r[s.key] }))}
                      >
                        {reveal[s.key] ? 'Hide' : 'Reveal'}
                      </button>
                    </div>
                    <div className="spread">
                      <code className="mono tiny" style={{ color: 'var(--text-dim)' }}>
                        {s.key} = {reveal[s.key] ? '••••value-revealed••••' : maskKey(s.key)}
                      </code>
                      <div className="row" style={{ gap: 'var(--space-3)' }}>
                        <span className="tiny tabular muted">updated {formatDate(s.updatedAt)}</span>
                        <button
                          className="btn btn--danger btn--sm"
                          onClick={() => {
                            if (confirm(`Delete "${s.key}"?`)) del.mutate(s.key);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <h2 style={{ fontSize: 'var(--fs-lg)', margin: 0, marginBottom: 'var(--space-3)' }}>Add or update</h2>
          <div className="card">
            <form
              onSubmit={(e) => { e.preventDefault(); put.mutate(); }}
              className="col"
              style={{ gap: 'var(--space-3)' }}
            >
              <div className="field">
                <label className="field__label">Key</label>
                <input
                  list="settings-presets"
                  className="input"
                  required
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="openai_api_key"
                />
                <datalist id="settings-presets">
                  {PRESETS.map((p) => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </datalist>
                {PRESETS.find((p) => p.key === key) && (
                  <span className="tiny muted" style={{ marginTop: 4 }}>
                    {PRESETS.find((p) => p.key === key)?.hint}
                  </span>
                )}
              </div>
              <div className="field">
                <label className="field__label">Value</label>
                <input
                  type="password"
                  className="input"
                  required
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="sk-…"
                />
              </div>
              <div>
                <button className="btn btn--primary" type="submit" disabled={put.isPending}>
                  {put.isPending ? 'Saving…' : 'Save key'}
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}