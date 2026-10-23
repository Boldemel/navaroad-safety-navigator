import { expect, mock, test } from "bun:test";

const effects = [];
let readOnly = true;
let entitled = true;
const db = {
  auth: { getClaims: async () => ({ data: { claims: { sub: "caller" } } }) },
  from: (table) => {
    if (table !== "company_members") {
      effects.push(table);
      throw new Error("Blocked request reached downstream data access");
    }
    const query = {
      select: () => query, eq: () => query, order: () => query, limit: () => query,
      maybeSingle: async () => ({ data: { id: "member", company_id: "caller-company" } }),
    };
    return query;
  },
  rpc: async (name) => ({ data: name === "is_super_admin" ? false : name === "is_company_read_only" ? readOnly : entitled, error: null }),
};

mock.module("@supabase/supabase-js", () => ({ createClient: () => db }));
mock.module("@/lib/ai-gateway.server", () => ({ createLovableAiGatewayProvider: () => {
  effects.push("gateway"); throw new Error("Blocked request reached AI");
} }));
mock.module("@/lib/ai/fleet-context.server", () => ({ buildFleetContext: () => {
  effects.push("context"); throw new Error("Blocked request reached fleet context");
} }));

test("POST handler denies before body, message storage, context, and AI", async () => {
  const names = ["LOVABLE_API_KEY", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"];
  const previous = names.map(name => process.env[name]);
  process.env.LOVABLE_API_KEY = "mock";
  process.env.SUPABASE_URL = "https://example.invalid";
  process.env.SUPABASE_PUBLISHABLE_KEY = "mock";
  try {
    const { Route } = await import("../../routes/api/chat.ts");
    const handler = Route.options.server.handlers.POST;
    for (const scenario of [{ ro: true, feature: true, status: 402 }, { ro: false, feature: false, status: 403 }]) {
      readOnly = scenario.ro;
      entitled = scenario.feature;
      const response = await handler({ request: new Request("https://example.invalid/api/chat", {
        method: "POST", headers: { authorization: "Bearer mock-token" }, body: "not even valid JSON",
      }) });
      expect(response.status).toBe(scenario.status);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(effects).toEqual([]);
    }
  } finally {
    names.forEach((name, index) => {
      if (previous[index] === undefined) delete process.env[name];
      else process.env[name] = previous[index];
    });
  }
});