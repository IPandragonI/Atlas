import { describe, expect, it } from "vitest";
import audit from "@/data/connections/sea-audit.json";
import connections from "@/data/connections/connections.json";
import { SEA_DISTANCE_EXCEPTIONS, SEA_DISTANCE_LIMIT_KM } from "@/data/connections/overrides";

const key = (a: string, b: string) => [a, b].sort().join("-");
const seaPairs = (connections as unknown as { sea: [string, string][] }).sea;
const measured = new Map((audit as { pairs: { a: string; b: string; km: number }[] }).pairs.map((p) => [key(p.a, p.b), p.km]));
const exceptions = new Map(SEA_DISTANCE_EXCEPTIONS.map(([a, b, why]) => [key(a, b), why]));

describe("sea links are short crossings, measured on the real coastlines", () => {
  it("the audit is up to date: every curated sea link has a measured distance (run `npm run data:audit-sea`)", () => {
    for (const [a, b] of seaPairs) expect(measured.has(key(a, b)), `${a}-${b} not audited`).toBe(true);
    expect(measured.size).toBe(seaPairs.length);
  });
  it(`no crossing exceeds ${SEA_DISTANCE_LIMIT_KM} km unless it is a documented exception`, () => {
    const offenders = seaPairs
      .map(([a, b]) => ({ id: key(a, b), km: measured.get(key(a, b)) ?? 0 }))
      .filter((p) => p.km > SEA_DISTANCE_LIMIT_KM && !exceptions.has(p.id));
    expect(offenders).toEqual([]);
  });
  it("every exception is real, really exceeds the limit, and states a reason", () => {
    for (const [id, why] of exceptions) {
      expect(measured.has(id), `${id} is not a sea link any more`).toBe(true);
      expect(measured.get(id)!, `${id} is within the limit: remove the exception`).toBeGreaterThan(SEA_DISTANCE_LIMIT_KM);
      expect(why.length, id).toBeGreaterThan(20);
    }
    expect(exceptions.size).toBe(SEA_DISTANCE_EXCEPTIONS.length); // no duplicates
  });
  it("the exceptions stay few: they are for remote islands and published daily challenges only", () => {
    expect(SEA_DISTANCE_EXCEPTIONS.length).toBeLessThanOrEqual(10);
  });
});
