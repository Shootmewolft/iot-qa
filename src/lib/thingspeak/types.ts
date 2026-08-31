/**
 * Domain shapes for data read back from ThingSpeak.
 *
 * Note this is NOT the `Measurement` shape used for uploads (spec section
 * 10.1). A reading's fields are nullable on purpose: ThingSpeak stores both
 * fields inside the same entry, so an entry can legitimately carry a
 * timestamp with only one of them — which is exactly the state the
 * "clear a single field" maintenance path produces (spec section 20.5).
 */
export type ChannelReading = {
  entryId: number;
  /** ISO 8601 in UTC. */
  createdAt: string;
  temperature: number | null;
  humidity: number | null;
};

export type ChannelInfo = {
  id: number;
  name: string;
  description: string | null;
  /** Label configured for field1 on the channel, if any. */
  temperatureLabel: string | null;
  /** Label configured for field2 on the channel, if any. */
  humidityLabel: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastEntryId: number | null;
};

export type ChannelFeed = {
  channel: ChannelInfo;
  readings: ChannelReading[];
};
