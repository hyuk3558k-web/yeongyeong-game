// 편향 없는 난수 도구 (랜덤 출제 규칙 R1)
// - 실제 앱: crypto.getRandomValues 기반
// - 테스트: 시드를 넣으면 같은 결과가 반복되는 난수(sfc32)
// Math.random()이나 sort(() => Math.random() - 0.5) 셔플은 편향이 있으므로 쓰지 않는다.

const TWO_32 = 0x100000000;

export function createRng(seed) {
  if (seed === undefined) return cryptoRng();
  return seededRng(seed);
}

function cryptoRng() {
  const buf = new Uint32Array(64);
  let i = buf.length;
  return {
    nextUint32() {
      if (i >= buf.length) {
        globalThis.crypto.getRandomValues(buf);
        i = 0;
      }
      return buf[i++];
    },
  };
}

// sfc32: 작고 품질 좋은 시드 난수. 문자열/숫자 시드를 모두 받는다.
function seededRng(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (const ch of String(seed)) {
    h = Math.imul(h ^ ch.charCodeAt(0), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const mix = () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
  let a = mix(), b = mix(), c = mix(), d = mix();
  const rng = {
    nextUint32() {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      let t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return t >>> 0;
    },
  };
  for (let k = 0; k < 15; k++) rng.nextUint32();
  return rng;
}

// 0 이상 n 미만 정수. 거부 샘플링으로 나머지 편향을 없앤다.
export function randomInt(rng, n) {
  if (!Number.isInteger(n) || n <= 0) throw new RangeError(`randomInt: n must be a positive integer (got ${n})`);
  const limit = TWO_32 - (TWO_32 % n);
  let x;
  do {
    x = rng.nextUint32();
  } while (x >= limit);
  return x % n;
}

// 0 이상 1 미만 실수
export function randomFloat(rng) {
  return rng.nextUint32() / TWO_32;
}

export function chance(rng, p) {
  return randomFloat(rng) < p;
}

// Fisher–Yates. 원본은 바꾸지 않고 새 배열을 돌려준다.
export function shuffle(arr, rng) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pick(arr, rng) {
  if (arr.length === 0) return undefined;
  return arr[randomInt(rng, arr.length)];
}

// 중복 없이 k개 무작위 선택
export function sample(arr, k, rng) {
  return shuffle(arr, rng).slice(0, Math.min(k, arr.length));
}
