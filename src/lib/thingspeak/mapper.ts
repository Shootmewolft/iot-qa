import type {
  RawChannel,
  RawFeedEntry,
  RawFeedResponse,
} from "@/lib/thingspeak/schemas";
import type {
  ChannelFeed,
  ChannelInfo,
  ChannelReading,
} from "@/lib/thingspeak/types";

/**
 * ThingSpeak sends field values as strings ("26.4"), as null, or as an empty
 * string when the entry has no value for that field. Anything that is not a
 * finite number becomes null rather than NaN, so downstream statistics never
 * have to defend against NaN leaking into an average.
 */
export function parseFieldValue(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (trimmed === "") return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Normalizes a timestamp to ISO 8601 in UTC. ThingSpeak echoes back whatever
 * timezone the request asked for, so we pin it to UTC here and let the UI
 * localize (spec section 12.5). Returns null for an unparseable date.
 */
export function parseTimestamp(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function mapReading(entry: RawFeedEntry): ChannelReading | null {
  const createdAt = parseTimestamp(entry.created_at);
  if (createdAt === null) return null;

  return {
    entryId: entry.entry_id,
    createdAt,
    temperature: parseFieldValue(entry.field1),
    humidity: parseFieldValue(entry.field2),
  };
}

export function mapChannel(channel: RawChannel): ChannelInfo {
  return {
    id: channel.id,
    name: channel.name ?? `Canal ${channel.id}`,
    description: channel.description ?? null,
    temperatureLabel: channel.field1 ?? null,
    humidityLabel: channel.field2 ?? null,
    createdAt: channel.created_at ? parseTimestamp(channel.created_at) : null,
    updatedAt: channel.updated_at ? parseTimestamp(channel.updated_at) : null,
    lastEntryId: channel.last_entry_id ?? null,
  };
}

export function mapFeed(response: RawFeedResponse): ChannelFeed {
  return {
    channel: mapChannel(response.channel),
    // Entries with an unusable timestamp are dropped: a reading we cannot
    // place in time is worse than no reading at all.
    readings: response.feeds
      .map(mapReading)
      .filter((reading): reading is ChannelReading => reading !== null),
  };
}
