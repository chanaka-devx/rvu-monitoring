export interface Random {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(array: readonly T[]): T;
  chance(probability: number): boolean;
}

const MULTIPLIER = 0x6d2b79f5;

export function createRandom(seed: number): Random {
  let state = seed >>> 0;

  const nextValue = (): number => {
    state = (state + MULTIPLIER) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };

  return {
    next: nextValue,
    int(min: number, max: number): number {
      return min + Math.floor(nextValue() * (max - min + 1));
    },
    pick<T>(array: readonly T[]): T {
      if (array.length === 0) {
        throw new Error('pick requires a non-empty array');
      }
      return array[this.int(0, array.length - 1)] as T;
    },
    chance(probability: number): boolean {
      return nextValue() < probability;
    }
  };
}
