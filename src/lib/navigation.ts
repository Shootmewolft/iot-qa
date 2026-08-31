/**
 * A nav entry is active on an exact match, or when the current path is nested
 * under it. Parent entries listed in `exactOnly` never match by prefix, so
 * `/datasets` does not stay highlighted while `/datasets/generar` is open.
 */
const exactOnly = new Set(["/datasets"]);

export function isActiveRoute(pathname: string, href: string) {
  if (pathname === href) return true;
  if (exactOnly.has(href)) return false;
  return pathname.startsWith(`${href}/`);
}
