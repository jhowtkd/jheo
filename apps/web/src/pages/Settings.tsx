import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { deleteSetting, listSettings, upsertSetting } from '../api.js';

const PRESET_KEYS = [
  'openai_api_key',
  'openai_embedding_api_key',
  'anthropic_api_key',
  'openrouter_api_key',
] as const;
type PresetKey = typeof PRESET_KEYS[number];

function isPresetKey(k: string): k is PresetKey {
  return (PRESET_KEYS as readonly string[]).includes(k);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function maskKey(): string {
  return '••••••••••••';
}

export function Settings() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['settings'], queryFn: listSettings });
  const [key, setKey] = useState<PresetKey>('openai_api_key');
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

  const presets = PRESET_KEYS.map((pk) => ({
    key: pk,
    label: t(`settings.presets.${pk}.label`),
    hint: t(`settings.presets.${pk}.hint`),
  }));

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">{t('settings.title')}</h1>
          <p className="page__subtitle">{t('settings.subtitle')}</p>
        </div>
      </div>

      <div className="col" style={{ gap: 'var(--space-6)' }}>
        <section>
          <h2 style={{ fontSize: 'var(--fs-lg)', margin: 0, marginBottom: 'var(--space-3)' }}>{t('settings.storedKeysTitle')}</h2>
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
              <p className="empty__title">{t('settings.empty.title')}</p>
              <p className="empty__hint">{t('settings.empty.hint')}</p>
            </div>
          )}
          {list.data && list.data.length > 0 && (
            <div className="col" style={{ gap: 'var(--space-2)' }}>
              {list.data.map((s) => {
                const preset = isPresetKey(s.key) ? presets.find((p) => p.key === s.key) : undefined;
                return (
                  <div key={s.key} className="card" style={{ padding: 'var(--space-4) var(--space-5)' }}>
                    <div className="spread" style={{ marginBottom: 'var(--space-2)' }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{preset?.label ?? s.key}</div>
                        <div className="tiny muted" style={{ marginTop: 2 }}>
                          {preset?.hint ?? t('settings.customSetting')}
                        </div>
                      </div>
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => setReveal((r) => ({ ...r, [s.key]: !r[s.key] }))}
                      >
                        {reveal[s.key] ? t('common.hide') : t('common.reveal')}
                      </button>
                    </div>
                    <div className="spread">
                      <code className="mono tiny" style={{ color: 'var(--text-dim)' }}>
                        {s.key} = {reveal[s.key] ? '••••value-revealed••••' : maskKey()}
                      </code>
                      <div className="row" style={{ gap: 'var(--space-3)' }}>
                        <span className="tiny tabular muted">{t('settings.updatedAt', { date: formatDate(s.updatedAt) })}</span>
                        <button
                          className="btn btn--danger btn--sm"
                          onClick={() => {
                            if (confirm(t('settings.deleteConfirm', { key: s.key }))) del.mutate(s.key);
                          }}
                        >
                          {t('common.delete')}
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
          <h2 style={{ fontSize: 'var(--fs-lg)', margin: 0, marginBottom: 'var(--space-3)' }}>{t('settings.addOrUpdateTitle')}</h2>
          <div className="card">
            <form
              onSubmit={(e) => { e.preventDefault(); put.mutate(); }}
              className="col"
              style={{ gap: 'var(--space-3)' }}
            >
              <div className="field">
                <label className="field__label">{t('settings.addFields.keyLabel')}</label>
                <input
                  list="settings-presets"
                  className="input"
                  required
                  value={key}
                  onChange={(e) => setKey(e.target.value as PresetKey)}
                  placeholder={t('settings.addFields.keyPlaceholder')}
                />
                <datalist id="settings-presets">
                  {presets.map((p) => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </datalist>
                {isPresetKey(key) && (
                  <span className="tiny muted" style={{ marginTop: 4 }}>
                    {presets.find((p) => p.key === key)?.hint}
                  </span>
                )}
              </div>
              <div className="field">
                <label className="field__label">{t('settings.addFields.valueLabel')}</label>
                <input
                  type="password"
                  className="input"
                  required
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={t('settings.addFields.valuePlaceholder')}
                />
              </div>
              <div>
                <button className="btn btn--primary" type="submit" disabled={put.isPending}>
                  {put.isPending ? t('settings.addFields.saving') : t('settings.addFields.save')}
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}