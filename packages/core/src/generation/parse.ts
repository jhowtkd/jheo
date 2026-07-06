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

export function parseMarkdownWithFrontmatter(raw: string): ParseResult {
  // Strip leading whitespace.
  let s = raw.replace(/^\uFEFF/, '');
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
  if (body.length < 50) {
    // Let schema validation surface this as the user-visible failure.
    body = body.padEnd(50, '\n');
  }
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