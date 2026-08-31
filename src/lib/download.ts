/**
 * Triggers a browser download for generated content.
 *
 * Nothing is uploaded: the file is built in the tab and handed straight to
 * the user, so a 10,000-row export never crosses the network.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(
  content: string,
  filename: string,
  mimeType = "text/csv;charset=utf-8",
): void {
  downloadBlob(new Blob([content], { type: mimeType }), filename);
}

/** Filesystem-safe, sortable filename stem, e.g. `dataset-20260801-130000`. */
export function timestampedName(prefix: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replaceAll(/[-:T]/g, "");
  return `${prefix}-${stamp}`;
}
