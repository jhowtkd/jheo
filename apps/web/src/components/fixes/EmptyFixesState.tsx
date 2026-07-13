import { useTranslation } from 'react-i18next';
import { localePath } from '../../i18n/localePath.js';
import { EmptyState } from '../states/EmptyState.js';

type Kind = 'no-findings' | 'no-audits' | 'no-projects';

const COPY: Record<Kind, {
  titleKey: string;
  hintKey?: string;
  cta?: { to: () => string; labelKey: string };
}> = {
  'no-findings': {
    titleKey: 'fixes.empty',
    hintKey: 'fixes.emptyHint',
  },
  'no-audits': {
    titleKey: 'fixes.chooseProject.noAudits',
  },
  'no-projects': {
    titleKey: 'fixes.chooseProject.noProjects',
    cta: { to: () => localePath('projects'), labelKey: 'fixes.chooseProject.goProjects' },
  },
};

// Shared SVG empty-state art reused across the fixes flow. Stylistically
// matches the empty art in FindingList (light circular motif) so the page
// reads as one piece.
function FixesEmptyArt() {
  return (
    <svg viewBox="0 0 56 56" aria-hidden>
      <circle cx="28" cy="28" r="22" stroke="var(--border)" strokeWidth="2" fill="none" />
      <path d="M18 30l8 8 14-16" stroke="var(--text-muted)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function EmptyFixesState({ kind = 'no-findings' }: { kind?: Kind }) {
  const { t } = useTranslation();
  const copy = COPY[kind];
  return (
    <EmptyState
      titleKey={copy.titleKey}
      {...(copy.hintKey ? { hintKey: copy.hintKey } : {})}
      {...(copy.cta ? { cta: { to: copy.cta.to, labelKey: copy.cta.labelKey } } : {})}
    >
      <FixesEmptyArt />
    </EmptyState>
  );
}
