import { detectAnomalies } from "@/lib/statistics/anomalies";
import { pearson } from "@/lib/statistics/correlation";
import { describeSeries } from "@/lib/statistics/descriptive";
import type { ChannelReading } from "@/lib/thingspeak/types";

export function summarizeReadings(readings: ChannelReading[]) {
  const temperature = describeSeries(
    readings.map((reading) => reading.temperature),
  );
  const humidity = describeSeries(readings.map((reading) => reading.humidity));
  const correlation = pearson(
    readings.map((reading) => reading.temperature),
    readings.map((reading) => reading.humidity),
  );

  const temperatureAnomalies = detectAnomalies(
    readings,
    (reading) => reading.temperature,
  );
  const humidityAnomalies = detectAnomalies(
    readings,
    (reading) => reading.humidity,
  );
  const anomalousEntryIds = new Set([
    ...temperatureAnomalies.map((anomaly) => anomaly.item.entryId),
    ...humidityAnomalies.map((anomaly) => anomaly.item.entryId),
  ]);

  return {
    temperature,
    humidity,
    correlation,
    temperatureAnomalies,
    humidityAnomalies,
    anomalousEntryIds,
  };
}
