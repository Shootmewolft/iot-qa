/**
 * Stand-in for the `server-only` marker package under Vitest.
 *
 * The real package throws on import unless the `react-server` export
 * condition is active, which would make every server module untestable.
 * Aliased in vitest.config.mts.
 */
export {};
