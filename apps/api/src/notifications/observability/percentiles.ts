export function computeLatencyPercentiles(values: number[]): {
  p50: number;
  p95: number;
  p99: number;
  avg: number;
} {
  if (values.length === 0) {
    return { p50: 0, p95: 0, p99: 0, avg: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number): number => {
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
  };

  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  return {
    p50: percentile(50),
    p95: percentile(95),
    p99: percentile(99),
    avg,
  };
}
