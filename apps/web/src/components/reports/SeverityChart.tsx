import { renderSeverityDonutSvg } from '@jheo/core';

interface Props {
  counts: { error: number; warning: number; info: number };
}

export function SeverityChart({ counts }: Props) {
  return <div dangerouslySetInnerHTML={{ __html: renderSeverityDonutSvg(counts) }} />;
}
