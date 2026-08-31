import { describe, expect, it } from "vitest";

import {
  detectMapping,
  isMappingComplete,
  normalizeHeader,
} from "@/lib/import/mapping";

describe("normalizeHeader", () => {
  it("strips accents, case and separators", () => {
    expect(normalizeHeader("Temperatura")).toBe("temperatura");
    expect(normalizeHeader("  FECHA_Y_HORA  ")).toBe("fecha y hora");
    expect(normalizeHeader("created_at")).toBe("created at");
    expect(normalizeHeader("Humedad-Relativa")).toBe("humedad relativa");
  });
});

describe("detectMapping", () => {
  it("maps the ThingSpeak header row exactly", () => {
    expect(detectMapping(["created_at", "field1", "field2"])).toEqual({
      createdAt: "created_at",
      temperature: "field1",
      humidity: "field2",
    });
  });

  it("maps Spanish headers", () => {
    expect(detectMapping(["Fecha y hora", "Temperatura", "Humedad"])).toEqual({
      createdAt: "Fecha y hora",
      temperature: "Temperatura",
      humidity: "Humedad",
    });
  });

  it("maps headers carrying units", () => {
    const mapping = detectMapping([
      "Timestamp",
      "Temperatura (°C)",
      "Humedad relativa (%)",
    ]);

    expect(mapping.temperature).toBe("Temperatura (°C)");
    expect(mapping.humidity).toBe("Humedad relativa (%)");
  });

  it("prefers an exact match over a partial one", () => {
    const mapping = detectMapping([
      "created_at",
      "temperatura ambiente",
      "field1",
      "field2",
    ]);

    expect(mapping.temperature).toBe("field1");
  });

  it("never assigns one column to two fields", () => {
    const mapping = detectMapping(["fecha", "temp", "temp"]);
    const assigned = Object.values(mapping).filter(Boolean);

    expect(new Set(assigned).size).toBe(assigned.length);
  });

  it("leaves a field unmapped when nothing matches", () => {
    const mapping = detectMapping(["a", "b", "c"]);

    expect(mapping).toEqual({
      createdAt: null,
      temperature: null,
      humidity: null,
    });
    expect(isMappingComplete(mapping)).toBe(false);
  });

  it("ignores extra columns", () => {
    const mapping = detectMapping([
      "entry_id",
      "created_at",
      "field1",
      "field2",
      "latitude",
    ]);

    expect(isMappingComplete(mapping)).toBe(true);
    expect(mapping.createdAt).toBe("created_at");
  });
});
