import { parse as parseYaml } from 'yaml';
import { FrontMatterSchema, ParsedMarkdownSchema, type ParsedMarkdown } from './schema.js';

export type ParseError = 'no-frontmatter' | 'invalid-yaml' | 'schema-violation';

export interface ParseResult {
  ok: boolean;
  parsed?: ParsedMarkdown;
  raw: string;
  error?: ParseError;
  detail?: string;
}

/**
 * Strip leading noise some chat-style / reasoning models emit before the
 * actual payload (translation lines, JSON, YAML frontmatter, …):
 *   - a UTF-8 BOM
 *   - a chain-of-thought block (`<think>…</think>`)
 *   - a leading code fence opener (```yaml) that wraps structured output
 * Exported so translate + suggestion parsers can reuse the same cleanup
 * MiniMax-M3 (and similar) apply before their real answer.
 */
export function stripLlmThinking(raw: string): string {
  let s = raw.replace(/^\uFEFF/, '');
  // Drop a leading `<think>…</think>` chain-of-thought block.
  s = s.replace(/^\s*<think>[\s\S]*?(?:<\/think>|$)/i, '');
  // Drop a leading opening code fence (``` or ```yaml) before the payload.
  s = s.replace(/^\s*```(?:yaml|markdown|md|json)?\s*\n/, '');
  // If there's still a `<think>` we missed (no close tag), strip until end of
  // first paragraph to be safe.
  s = s.replace(/^\s*<think>[\s\S]*?\n\n/, '');
  // Trim leading blank lines.
  s = s.replace(/^\s*\n+/, '');
  return s;
}

export function parseMarkdownWithFrontmatter(raw: string): ParseResult {
  // Strip leading noise from chat-style models (`<think>...`, code fences,
  // BOM) before checking for the frontmatter delimiter.
  let s = stripLlmThinking(raw);
  if (!s.startsWith('---')) {
    return { ok: false, raw, error: 'no-frontmatter', detail: 'must start with --- frontmatter' };
  }
  // Find the closing --- line.
  const lines = s.split('\n');
  if (lines[0]?.trim() !== '---') {
    return { ok: false, raw, error: 'no-frontmatter' };
  }
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) {
    return { ok: false, raw, error: 'no-frontmatter', detail: 'closing --- not found' };
  }
  const yamlText = lines.slice(1, endIdx).join('\n');
  let body = lines
    .slice(endIdx + 1)
    .join('\n')
    .replace(/^\n+/, '');
  let parsedYaml: unknown;
  try {
    parsedYaml = parseYaml(yamlText);
  } catch (e) {
    return { ok: false, raw, error: 'invalid-yaml', detail: String(e) };
  }
  const fmResult = FrontMatterSchema.safeParse(parsedYaml);
  if (!fmResult.success) {
    return { ok: false, raw, error: 'schema-violation', detail: fmResult.error.message };
  }
  const fullResult = ParsedMarkdownSchema.safeParse({ frontMatter: fmResult.data, body });
  if (!fullResult.success) {
    return { ok: false, raw, error: 'schema-violation', detail: fullResult.error.message };
  }
  return { ok: true, parsed: fullResult.data, raw };
}
