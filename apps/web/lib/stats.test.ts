import { describe, expect, it } from "vitest";
import { computeStats } from "./stats";
import { decodeJwtPayload } from "./jwt";

describe("computeStats", () => {
  it("computes average, median and p95", () => {
    const stats = computeStats(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(stats).toMatchObject({ samples: 20, avg: 10.5, median: 10.5, p95: 19 });
    expect(stats.stdDev).toBeCloseTo(5.916, 3);
  });

  it("handles empty and single samples", () => {
    expect(computeStats([]).samples).toBe(0);
    expect(computeStats([7])).toEqual({ samples: 1, avg: 7, median: 7, p95: 7, stdDev: 0 });
  });
});

describe("decodeJwtPayload", () => {
  it("decodes a payload without verifying", () => {
    const payload = btoa(JSON.stringify({ sub: "1:1:web:a", exp: 10 })).replace(/=/g, "");
    expect(decodeJwtPayload(`h.${payload}.s`)).toEqual({ sub: "1:1:web:a", exp: 10 });
  });

  it("returns null for garbage", () => {
    expect(decodeJwtPayload("garbage")).toBeNull();
  });
});
