import * as fc from 'fast-check';
import { InMemoryDedupStore } from './in-memory-dedup.store';

describe('InMemoryDedupStore', () => {
  it('checkAndSet returns false exactly once per distinct key', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom('a', 'b', 'c', 'd', 'e'), {
          minLength: 0,
          maxLength: 40,
        }),
        async (keys) => {
          const store = new InMemoryDedupStore();
          let freshCount = 0;
          for (const key of keys) {
            const alreadySeen = await store.checkAndSet(key);
            if (!alreadySeen) freshCount += 1;
          }
          expect(freshCount).toBe(new Set(keys).size);
        },
      ),
    );
  });
});
