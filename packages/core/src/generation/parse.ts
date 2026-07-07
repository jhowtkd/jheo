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
 * Strip the leading noise some chat-style models emit before the actual
 * structured output:
 *   - a UTF-8 BOM
 *   - a chain-of-thought block (`...`)
 *   - a leading code fence opener (```yaml) that wraps the frontmatter
 * After stripping, the returned string starts at the first YAML frontmatter
 * delimiter `---` it can find. If no such delimiter exists in the input,
 * the original string is returned unchanged so the caller can flag
 * `no-frontmatter`.
 */
function stripThinkingPrefix(raw: string): string {
  let s = raw.replace(/^\uFEFF/, '');
  // Drop a leading `...` chain-of-thought block (up to first blank line).
  s = s.replace(/^\s*<think>[\s\S]*?(?:<\/think>|$)/i, '');
  // Drop a leading opening code fence (``` or ```yaml) before the frontmatter.
  s = s.replace(/^\s*```(?:yaml|markdown|md)?\s*\n/, '');
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
  let s = stripThinkingPrefix(raw);
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
  let body = lines.slice(endIdx + 1).join('\n').replace(/^\n+/, '');
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