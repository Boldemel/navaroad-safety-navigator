import { describe, expect, test } from "bun:test";
import { checkChatAccess } from "./chat-access.server.ts";

function client({ readOnly = false, feature = true, superAdmin = false, errorOn } = {}) {
  const calls = [];
  return {
    calls,
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: name === "is_super_admin" ? superAdmin : name === "is_company_read_only" ? readOnly : feature,
        error: name === errorOn ? { message: "failed" } : null };
    },
  };
}

describe("chat authorization before paid work", () => {
  for (const state of ["pre-checkout", "expired trial", "suspended", "cancelled", "past_due"]) {
    test(`${state} database read-only verdict blocks chat with 402`, async () => {
      const db = client({ readOnly: true });
      const denied = await checkChatAccess(db, "caller", "caller-company");
      expect(denied?.status).toBe(402);
      expect((await denied.json()).code).toBe("SUBSCRIPTION_READ_ONLY");
    });
  }
  test("wrong feature is denied with 403 using ai_assistant and caller company", async () => {
    const db = client({ feature: false });
    expect((await checkChatAccess(db, "caller", "caller-company"))?.status).toBe(403);
    expect(db.calls.find(c => c.name === "company_has_feature")?.args).toEqual({ _company: "caller-company", _feature: "ai_assistant" });
    expect(db.calls.find(c => c.name === "is_company_read_only")?.args).toEqual({ _company: "caller-company" });
  });
  for (const state of ["active company", "Stripe-created trial", "authorized active internal company"]) {
    test(`${state} retains access when database says writable and entitled`, async () => {
      expect(await checkChatAccess(client(), "caller", "caller-company")).toBeNull();
    });
  }
  test("verified super-admin exemption is preserved", async () => {
    const db = client({ superAdmin: true, readOnly: true, feature: false });
    expect(await checkChatAccess(db, "caller", "caller-company")).toBeNull();
    expect(db.calls.length).toBe(1);
  });
  for (const errorOn of ["is_super_admin", "is_company_read_only", "company_has_feature"]) {
    test(`${errorOn} failure fails closed`, async () => {
      expect((await checkChatAccess(client({ errorOn }), "caller", "caller-company"))?.status).toBe(503);
    });
  }
});