import type { MetadataRoute } from "next";

/**
 * Blocks every well-behaved crawler. This is an instruction, not access
 * control: the real gate is the session check in `proxy.ts` and in each
 * protected layout and Route Handler (MVP spec, section 5.1).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
