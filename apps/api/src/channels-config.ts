import { z } from 'zod';

export const ChannelTypeSchema = z.enum(['wordpress', 'http', 'agent']);

const WordPressConfigSchema = z.object({
  siteUrl: z.string().url(),
  username: z.string().min(1),
  appPassword: z.string().min(1),
  defaultStatus: z.enum(['draft', 'publish']).default('draft'),
});

const HttpAuthSchema = z.discriminatedUnion('scheme', [
  z.object({ scheme: z.literal('none') }),
  z.object({ scheme: z.literal('basic'), username: z.string().min(1), password: z.string().min(1) }),
  z.object({ scheme: z.literal('bearer'), token: z.string().min(1) }),
]);

const HttpConfigSchema = z.object({
  endpointUrl: z.string().url(),
  method: z.literal('POST').default('POST'),
  headers: z.record(z.string()).default({}),
  bodyTemplate: z.string().optional(),
  auth: HttpAuthSchema.optional(),
  responsePath: z
    .object({
      externalId: z.string().optional(),
      externalUrl: z.string().optional(),
    })
    .optional(),
});

const AgentConfigSchema = z.object({
  siteName: z.string().min(1),
  themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0ea5e9'),
  assetFolder: z.string().default('assets'),
});

export const ConfigByTypeSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('wordpress'),
    config: WordPressConfigSchema,
  }),
  z.object({
    type: z.literal('http'),
    config: HttpConfigSchema,
  }),
  z.object({
    type: z.literal('agent'),
    config: AgentConfigSchema,
  }),
]);

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