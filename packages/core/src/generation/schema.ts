import { z } from 'zod';

export const FrontMatterSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .max(80),
  description: z.string().min(50).max(160),
  tags: z.array(z.string().min(1).max(40)).min(1).max(8),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sources: z.array(z.string()).min(0),
  targetSites: z.array(z.string().min(1)).min(1),
});

export const ParsedMarkdownSchema = z.object({
  frontMatter: FrontMatterSchema,
  body: z.string().min(50),
});

export type FrontMatter = z.infer<typeof FrontMatterSchema>;
export type ParsedMarkdown = z.infer<typeof ParsedMarkdownSchema>;
