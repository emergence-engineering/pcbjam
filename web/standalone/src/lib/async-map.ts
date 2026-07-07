/**
 * A counting semaphore: `acquire()` resolves immediately while permits remain,
 * otherwise queues (FIFO) until a `release()` hands the permit over.
 */
class Semaphore {
  private waiters: (() => void)[] = [];

  private permits: number;

  constructor(max: number) {
    this.permits = max;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  release(): void {
    const next = this.waiters.shift();
    if (next) next();
    else this.permits++;
  }
}

/**
 * `Promise.all(array.map(callback))` with at most `concurrencyLimit` callbacks
 * in flight at once. Results keep the input order. A callback rejection
 * rejects the whole map (wrap the callback if per-item failures should be
 * tolerated).
 */
export async function asyncMap<T, U>(
  array: T[],
  callback: (item: T, index: number, array: T[]) => Promise<U>,
  concurrencyLimit: number,
): Promise<U[]> {
  const semaphore = new Semaphore(concurrencyLimit);
  const results: U[] = [];

  const wrappedCallback = async (item: T, index: number, srcArray: T[]) => {
    await semaphore.acquire();
    try {
      const result = await callback(item, index, srcArray);
      results[index] = result;
    } finally {
      semaphore.release();
    }
  };

  await Promise.all(array.map((item, index) => wrappedCallback(item, index, array)));

  return results;
}
