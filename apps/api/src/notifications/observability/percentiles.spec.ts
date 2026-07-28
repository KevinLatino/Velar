import { computeLatencyPercentiles } from './percentiles';

describe('computeLatencyPercentiles', () => {
  it('returns zeros for an empty array', () => {
    expect(computeLatencyPercentiles([])).toEqual({
      p50: 0,
      p95: 0,
      p99: 0,
      avg: 0,
    });
  });

  it('returns the single value for all percentiles', () => {
    expect(computeLatencyPercentiles([42])).toEqual({
      p50: 42,
      p95: 42,
      p99: 42,
      avg: 42,
    });
  });

  it('computes percentiles for a known sorted range', () => {
    // 1..100 — nearest-rank: p50→50, p95→95, p99→99
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    const result = computeLatencyPercentiles(values);
    expect(result.p50).toBe(50);
    expect(result.p95).toBe(95);
    expect(result.p99).toBe(99);
    expect(result.avg).toBe(50.5);
  });

  it('does not mutate the input array', () => {
    const values = [30, 10, 20];
    computeLatencyPercentiles(values);
    expect(values).toEqual([30, 10, 20]);
  });
});
