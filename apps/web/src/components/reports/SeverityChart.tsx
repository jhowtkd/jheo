import { renderSeverityDonutSvg } from '@jheo/core/reports/charts';

interface Props {
  counts: { error: number; warning: number; info: number };
}

export function SeverityChart({ counts }: Props) {
  return <div dangerouslySetInnerHTML={{ __html: renderSeverityDonutSvg(counts) }} />;
}
