import { describe, expect, test } from "bun:test";
import { isSubscriptionReadOnly } from "./subscription.shared.ts";

const now = Date.parse("2026-10-23T00:00:00Z");
const end = "2026-10-30T00:00:00Z";

describe("Stripe-before-trial write gate", () => {
  test("future local seven-day trial without Stripe remains read-only", () => {
    expect(isSubscriptionReadOnly("trial", null, end, now)).toBe(true);
  });
  test("pre-checkout null dates remain read-only", () => {
    expect(isSubscriptionReadOnly("trial", null, null, now)).toBe(true);
  });
  test("Stripe-created seven-day trial stays writable", () => {
    expect(isSubscriptionReadOnly("trial", "sub_verified", end, now)).toBe(false);
  });
  test("trial expires at its end even with Stripe", () => {
    expect(isSubscriptionReadOnly("trial", "sub_verified", end, Date.parse(end))).toBe(true);
  });
  test("existing active internal company is not suspended", () => {
    expect(isSubscriptionReadOnly("active", null, null, now)).toBe(false);
  });
});