import { createServerFn } from "@tanstack/react-start";

/**
 * Returns the TomTom API key for client-side map tile loading.
 * TomTom keys are intended for browser use with the Map Display API —
 * restrict by HTTP referrer in the TomTom developer dashboard for production.
 */
export const getTomTomKey = createServerFn({ method: "GET" }).handler(async () => {
  return { key: process.env.TOMTOM_API_KEY ?? null };
});
