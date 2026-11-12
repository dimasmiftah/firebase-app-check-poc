import type { LatencyStats } from "@poc/shared";

export function computeStats(values: number[]): LatencyStats {
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  if (count === 0) return { samples: 0, avg: 0, median: 0, p95: 0 };
  const avg = sorted.reduce((sum, value) => sum + value, 0) / count;
  const mid = Math.floor(count / 2);
  const median = count % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const p95 = sorted[Math.min(count - 1, Math.ceil(0.95 * count) - 1)];
  const variance = count > 1 ? sorted.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (count - 1) : 0;
  return { samples: count, avg, median, p95, stdDev: Math.sqrt(variance) };
}
