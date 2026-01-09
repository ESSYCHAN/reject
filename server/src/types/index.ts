import { z } from 'zod';

export const RejectionCategorySchema = z.enum([
  'Template',
  'Soft No',
  'Hard No',
  'Door Open',
  'Polite Pass'
]);

export const ReplyWorthSchema = z.enum(['Low', 'Medium', 'High']);

export const DecodeResponseSchema = z.object({
  category: RejectionCategorySchema,
  confidence: z.number().min(0).max(1),
  signals: z.array(z.string()),
  what_it_means: z.string(),
  keep_on_file_truth: z.string(),
  reply_worth_it: ReplyWorthSchema,
  next_actions: z.array(z.string()),
  follow_up_template: z.string(),
  contradictions: z.array(z.string()).optional()
});

export type RejectionCategory = z.infer<typeof RejectionCategorySchema>;
export type ReplyWorth = z.infer<typeof ReplyWorthSchema>;
export type DecodeResponse = z.infer<typeof DecodeResponseSchema>;

export const DecodeRequestSchema = z.object({
  emailText: z.string()
    .min(10, 'Email text must be at least 10 characters')
    .max(8000, 'Email text must be under 8,000 characters')
    .transform(text => text.trim())
});

export type DecodeRequest = z.infer<typeof DecodeRequestSchema>;

export const SubscribeRequestSchema = z.object({
  email: z.string().email('Invalid email address')
});

export type SubscribeRequest = z.infer<typeof SubscribeRequestSchema>;

export interface ApiError {
  error: string;
  details?: string;
}

export interface ApiSuccess<T> {
  data: T;
}
