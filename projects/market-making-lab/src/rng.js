// Seeded random numbers, so every run can be reproduced exactly.
export function makeRng(seed) {
  let a = seed >>> 0;
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    let u = 0;
    while (u === 0) u = uniform();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * uniform());
  };
  const exponential = (mean) => {
    let u = 0;
    while (u === 0) u = uniform();
    return -Math.log(u) * mean;
  };
  const poisson = (lambda) => {
    const limit = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= uniform(); } while (p > limit);
    return k - 1;
  };
  const int = (n) => Math.floor(uniform() * n);
  return { uniform, normal, exponential, poisson, int };
}
