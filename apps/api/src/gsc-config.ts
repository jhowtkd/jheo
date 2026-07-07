import { z } from 'zod';

export const ServiceAccountJsonSchema = z.object({
  type: z.literal('service_account'),
  client_email: z.string().min(1),
  private_key: z.string().min(1),
  project_id: z.string().min(1),
});

export type ServiceAccountJson = z.infer<typeof ServiceAccountJsonSchema>;

const UrlPrefixSiteUrlSchema = z
  .string()
  .regex(/^https?:\/\/.+\/$/, 'URL-prefix properties require a trailing slash');

const DomainSiteUrlSchema = z
  .string()
  .regex(/^sc-domain:[a-z0-9.-]+$/, 'Domain properties use sc-domain:example.com');

export const GscSiteUrlSchema = z.union([UrlPrefixSiteUrlSchema, DomainSiteUrlSchema]);

export const PutGscConnectionBodySchema = z.object({
  siteUrl: GscSiteUrlSchema,
  serviceAccountJson: z.unknown(),
});

export function validateServiceAccountJson(json: unknown): ServiceAccountJson {
  return ServiceAccountJsonSchema.parse(json);
}

export function validateGscSiteUrl(url: string): string {
  return GscSiteUrlSchema.parse(url);
}
