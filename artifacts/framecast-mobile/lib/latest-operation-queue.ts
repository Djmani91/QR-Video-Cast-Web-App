export class SupersededOperationError extends Error {
  constructor() {
    super('This video request was replaced by a newer selection.');
    this.name = 'SupersededOperationError';
  }
}

/**
 * Serializes phone-hosted stream start/stop operations and lets only the
 * newest requested video become active.
 */
export class LatestOperationQueue {
  private version = 0;
  private tail: Promise<void> = Promise.resolve();

  issue(): number {
    this.version += 1;
    return this.version;
  }

  isCurrent(version: number): boolean {
    return version === this.version;
  }

  run<T>(version: number, operation: () => Promise<T>): Promise<T> {
    const result = this.tail.catch(() => undefined).then(async () => {
      if (!this.isCurrent(version)) throw new SupersededOperationError();
      return operation();
    });
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}
