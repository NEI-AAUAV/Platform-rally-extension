import { randomBytes } from "k6/crypto";

const UINT32 = 2 ** 32;

/** Uniform float in [0, 1), backed by k6's CSPRNG instead of Math.random. */
export function rand() {
  return new Uint32Array(randomBytes(4))[0] / UINT32;
}

/** Uniform integer in [0, n). */
export function randInt(n) {
  return Math.floor(rand() * n);
}
