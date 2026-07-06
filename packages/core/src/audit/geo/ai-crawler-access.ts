import type { AuditContext, Finding } from '../../types.js';

export const AI_CRAWLERS = [
  'GPTBot',
  'ClaudeBot',
  'Claude-Web',
  'PerplexityBot',
  'Google-Extended',
  'Applebot-Extended',
] as const;

interface Parsed {
  raw: Map<string, string[]>;
}

function parseRobots(text: string): Parsed {
  const groups = text.split(/\n\s*\n/);
  const raw = new Map<string, string[]>();
  for (const g of groups) {
    const lines = g.split('\n');
    const uaLine = lines.find((l) => /^User-agent:/i.test(l));
    if (!uaLine) continue;
    const ua = uaLine.split(':')[1]?.trim();
    if (!ua) continue;
    const list = raw.get(ua) ?? [];
    for (const line of lines) {
      if (/^Disallow:/i.test(line)) list.push(line.split(':').slice(1).join(':').trim());
    }
    raw.set(ua, list);
  }
  return { raw };
}

function effectiveFor(bot: string, parsed: Parsed): 'allowed' | 'blocked' | 'not-mentioned' {
  const groupRules = parsed.raw.get(bot);
  if (groupRules) {
    const blocked = groupRules.some((r) => r === '/' || r.startsWith('/'));
    return blocked ? 'blocked' : 'allowed';
  }
  const wildcard = parsed.raw.get('*');
  if (wildcard && wildcard.length > 0) {
    const blocked = wildcard.some((r) => r === '/' || r.startsWith('/'));
    return blocked ? 'blocked' : 'allowed';
  }
  return 'not-mentioned';
}

export async function checkAiCrawlerAccess(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  let res;
  try {
    res = await ctx.fetchText(new URL('/robots.txt', ctx.url).toString());
  } catch {
    return out;
  }
  if (res.status !== 200) return out;
  const parsed = parseRobots(res.text);
  for (const bot of AI_CRAWLERS) {
    const status = effectiveFor(bot, parsed);
    if (status === 'blocked') {
      out.push({
        category: 'geo',
        severity: 'warning',
        rule: `geo.ai-crawler-blocked.${bot}`,
        message: `${bot} is disallowed by robots.txt; the page may be missing from its index.`,
        url: ctx.url,
        evidence: { bot, status },
      });
    } else if (status === 'not-mentioned') {
      out.push({
        category: 'geo',
        severity: 'info',
        rule: `geo.ai-crawler-not-mentioned.${bot}`,
        message: `${bot} has no User-agent directive; crawlers fall back to *.`,
        url: ctx.url,
        evidence: { bot, status },
      });
    }
  }
  return out;
}
