export class OperationTimeoutError extends Error {
  readonly code = 'OPERATION_TIMEOUT';

  constructor(message: string) {
    super(message);
    this.name = 'OperationTimeoutError';
  }
}

export function withOperationTimeout<T>(
  operation: PromiseLike<T>,
  timeoutMs: number,
  message: string,
  onTimeout?: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      try { onTimeout?.(); } catch { /* A timeout must still reject if cancellation fails. */ }
      reject(new OperationTimeoutError(message));
    }, timeoutMs);
  });

  return Promise.race([Promise.resolve(operation), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
