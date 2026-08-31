import { z } from "zod";

/**
 * ThingSpeak returns every field value as a string, or null when the entry
 * carries no value for it. Numeric ids arrive as numbers. Anything we do not
 * consume is allowed through and ignored rather than rejected, so a change on
 * their side cannot break a read.
 */

const fieldValue = z.union([z.string(), z.number(), z.null()]).optional();

export const rawFeedEntrySchema = z
  .object({
    entry_id: z.number(),
    created_at: z.string(),
    field1: fieldValue,
    field2: fieldValue,
  })
  .loose();

export const rawChannelSchema = z
  .object({
    id: z.number(),
    name: z.string().optional(),
    description: z.string().nullish(),
    field1: z.string().nullish(),
    field2: z.string().nullish(),
    created_at: z.string().nullish(),
    updated_at: z.string().nullish(),
    last_entry_id: z.number().nullish(),
  })
  .loose();

export const rawFeedResponseSchema = z.object({
  channel: rawChannelSchema,
  feeds: z.array(rawFeedEntrySchema),
});

export type RawFeedEntry = z.infer<typeof rawFeedEntrySchema>;
export type RawChannel = z.infer<typeof rawChannelSchema>;
export type RawFeedResponse = z.infer<typeof rawFeedResponseSchema>;
