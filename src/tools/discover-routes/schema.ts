import { z } from 'zod';
import { AuthConfigSchema } from '../../shared/auth-context.js';

export const DiscoverRoutesInputSchema = z.object({
  baseUrl:     z.string().url(),
  projectRoot: z.string().optional(),
  maxDepth:    z.number().int().min(0).max(2).default(2),
  maxUrls:     z.number().int().min(1).max(100).default(100),
  timeoutMs:   z.number().int().positive().default(30_000),
  auth:        AuthConfigSchema.optional(),
});

export type DiscoverRoutesInput = z.infer<typeof DiscoverRoutesInputSchema>;

export interface DiscoverRoutesOutput {
  urls: string[];
  source: 'sitemap' | 'crawl' | 'both' | 'filesystem' | 'crawl+filesystem';
  warnings: string[];
}
