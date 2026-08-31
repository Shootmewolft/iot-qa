export const REPORT_COMPLETENESS = {
  INCOMPLETE: {
    title: "Informe incompleto",
    description:
      "Al menos una ventana alcanzó el límite de 8.000 entradas. Reduce el rango antes de guardar este informe como evidencia.",
  },
} as const;

export function getReportCompletenessNotice(truncated: boolean) {
  return truncated ? REPORT_COMPLETENESS.INCOMPLETE : null;
}
