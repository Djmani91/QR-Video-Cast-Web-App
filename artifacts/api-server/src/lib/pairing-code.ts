import { randomInt } from "node:crypto";

/** Prefer short codes, without changing any room that already has a code. */
export function allocatePairingCode(
  occupied: { has(code: string): boolean },
  randomStart: (capacity: number) => number = (capacity) => randomInt(capacity),
): string {
  for (const digits of [2, 3]) {
    const capacity = 10 ** digits;
    const start = randomStart(capacity);
    for (let attempt = 0; attempt < capacity; attempt += 1) {
      const code = ((start + attempt) % capacity).toString().padStart(digits, "0");
      if (!occupied.has(code)) return code;
    }
  }
  throw new Error("Unable to allocate a unique pairing code");
}
