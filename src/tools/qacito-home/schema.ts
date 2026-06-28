import { z } from 'zod';

export const qacitoHomeSchema = z.object({});

export type QacitoHomeInput = z.infer<typeof qacitoHomeSchema>;
