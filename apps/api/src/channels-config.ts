import { z } from 'zod';
import { UnsafeUrlError, assertSafeUrl } from './security/url-guard.js';
import { httpUrl } from './validation/http-url.js';

// Re-export for callers that don't want to import from url-guard directly.
export { UnsafeUrlError };

const ChannelTypeSchema = z.enum(['wordpress', 'http', 'agent']);

const PublicUrlSchema = httpUrl.superRefine((raw, ctx) => {
  try {
    assertSafeUrl(raw);
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: err.message });
      return;
    }
    throw err;
  }
});

const WordPressConfigSchema = z.object({
  siteUrl: PublicUrlSchema,
  username: z.string().min(1),
  appPassword: z.string().min(1),
  defaultStatus: z.enum(['draft', 'publish']).default('draft'),
});

const HttpAuthSchema = z.discriminatedUnion('scheme', [
  z.object({ scheme: z.literal('none') }),
  z.object({
    scheme: z.literal('basic'),
    username: z.string().min(1),
    password: z.string().min(1),
  }),
  z.object({ scheme: z.literal('bearer'), token: z.string().min(1) }),
]);

// JSONPath expressions are evaluated by jsonpath-plus. We strictly limit the
// grammar so a malicious channel config can't author `..` / `*` descent
// against a large response body, which historically caused quadratic blowups.
const JsonPathSchema = z
  .string()
  .min(2)
  .max(256)
  .regex(/^\$([.][\w-]+|\[[\]\d "'-]+\])*$/, 'must be a strict JSONPath without wildcard descent');

const HttpConfigSchema = z.object({
  endpointUrl: PublicUrlSchema,
  method: z.literal('POST').default('POST'),
  headers: z.record(z.string()).default({}),
  bodyTemplate: z.string().optional(),
  auth: HttpAuthSchema.optional(),
  responsePath: z
    .object({
      externalId: JsonPathSchema.optional(),
      externalUrl: JsonPathSchema.optional(),
    })
    .optional(),
});

const AgentConfigSchema = z.object({
  siteName: z.string().min(1),
  themeColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#0ea5e9'),
  assetFolder: z.string().default('assets'),
});

export const CreateChannelBodySchema = z.object({
  name: z.string().min(1).max(120),
  type: ChannelTypeSchema,
  config: z.unknown(),
  isActive: z.boolean().default(true),
});

export const UpdateChannelBodySchema = z.object({
  name: z.string().min(1).max(120).optional(),
  config: z.unknown().optional(),
  isActive: z.boolean().optional(),
});

export function validateConfig(type: string, config: unknown): unknown {
  switch (type) {
    case 'wordpress':
      return WordPressConfigSchema.parse(config);
    case 'http':
      return HttpConfigSchema.parse(config);
    case 'agent':
      return AgentConfigSchema.parse(config);
    default:
      throw new Error(`unknown channel type: ${type}`);
  }
}
