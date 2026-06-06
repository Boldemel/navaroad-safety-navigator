import { createServerFn } from "@tanstack/react-start";

export type MapConfig = { token: string | null };

export const getMapConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<MapConfig> => {
    const token = process.env.MAPBOX_PUBLIC_TOKEN ?? null;
    return { token: token && token.startsWith("pk.") ? token : null };
  },
);
