import type { ReactNode } from 'react';

export function SourceHighlight({ children }: { children: ReactNode }) {
  // Source highlighting is intentionally a passthrough in F2.
  // F2.5 will add a regex-based overlap detector between output text and source excerpts.
  return <>{children}</>;
}
