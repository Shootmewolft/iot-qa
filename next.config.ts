import type { NextConfig } from "next";

/**
 * Third anti-indexing layer, on top of the root `metadata.robots` and
 * `app/robots.ts`. A header covers responses that carry no HTML head at all,
 * such as Route Handler JSON (MVP spec, section 5.1).
 */
const NOINDEX_HEADER = {
  key: "X-Robots-Tag",
  value: "noindex, nofollow, noarchive, nosnippet, noimageindex",
};

const SECURITY_HEADERS = [
  NOINDEX_HEADER,
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
