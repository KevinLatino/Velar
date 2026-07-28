import * as fc from 'fast-check';
import { computeBackoffMs } from './retry';

describe('computeBackoffMs', () => {
  it('always returns a delay in [0, capMs]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 10_000 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (attempt, baseMs, factor, capMs, r) => {
          const delay = computeBackoffMs(attempt, baseMs, factor, capMs, () => r);
          expect(delay).toBeGreaterThanOrEqual(0);
          expect(delay).toBeLessThanOrEqual(capMs);
        },
      ),
    );
  });

  it('rng() => 0 always yields 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 10_000 }),
        (attempt, baseMs, factor, capMs) => {
          expect(computeBackoffMs(attempt, baseMs, factor, capMs, () => 0)).toBe(
            0,
          );
        },
      ),
    );
  });

  it('rng() => 1 always yields min(capMs, baseMs * factor^attempt)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 10_000 }),
        (attempt, baseMs, factor, capMs) => {
          const expected = Math.min(capMs, baseMs * Math.pow(factor, attempt));
          expect(computeBackoffMs(attempt, baseMs, factor, capMs, () => 1)).toBe(
            expected,
          );
        },
      ),
    );
  });
});
