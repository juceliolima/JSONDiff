/**
 * Alinhamento de sequências por conteúdo (para arrays sem campo identificador).
 *
 * Estratégia:
 *  1. Elementos idênticos (comparação canônica, ignorando ordem das chaves) são casados
 *     preservando a ordem — LCS exata para trechos pequenos, "patience diff" (âncoras únicas)
 *     para trechos grandes e casamento guloso como último recurso.
 *  2. Nos intervalos entre elementos idênticos, os que sobraram de cada lado são pareados
 *     por posição e comparados campo a campo; os excedentes viram inserções/remoções.
 */

export type Pair = [number, number]; // [índice no destino | -1, índice na origem | -1]

const DP_LIMIT = 4_000_000;

/** Pares (i, j) com a[i] === b[j], em ordem crescente nos dois índices. */
export function matchEqual(a: Int32Array, b: Int32Array): Pair[] {
  const out: Pair[] = [];
  rec(a, b, 0, a.length, 0, b.length, out);
  return out;
}

function rec(a: Int32Array, b: Int32Array, a0: number, a1: number, b0: number, b1: number, out: Pair[]) {
  while (a0 < a1 && b0 < b1 && a[a0] === b[b0]) out.push([a0++, b0++]);
  const tail: Pair[] = [];
  while (a0 < a1 && b0 < b1 && a[a1 - 1] === b[b1 - 1]) tail.push([--a1, --b1]);
  if (a0 < a1 && b0 < b1) {
    const n = a1 - a0;
    const m = b1 - b0;
    if (n * m <= DP_LIMIT) dp(a, b, a0, a1, b0, b1, out);
    else patience(a, b, a0, a1, b0, b1, out);
  }
  for (let i = tail.length - 1; i >= 0; i--) out.push(tail[i]);
}

function dp(a: Int32Array, b: Int32Array, a0: number, a1: number, b0: number, b1: number, out: Pair[]) {
  const n = a1 - a0;
  const m = b1 - b0;
  const W = m + 1;
  const L = new Uint32Array((n + 1) * W);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i * W + j] =
        a[a0 + i] === b[b0 + j] ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[a0 + i] === b[b0 + j]) {
      out.push([a0 + i, b0 + j]);
      i++;
      j++;
    } else if (L[(i + 1) * W + j] >= L[i * W + j + 1]) i++;
    else j++;
  }
}

function patience(a: Int32Array, b: Int32Array, a0: number, a1: number, b0: number, b1: number, out: Pair[]) {
  // contagem de ocorrências em cada lado
  const ca = new Map<number, number>();
  const pa = new Map<number, number>();
  for (let i = a0; i < a1; i++) {
    ca.set(a[i], (ca.get(a[i]) ?? 0) + 1);
    pa.set(a[i], i);
  }
  const cb = new Map<number, number>();
  const pb = new Map<number, number>();
  for (let j = b0; j < b1; j++) {
    cb.set(b[j], (cb.get(b[j]) ?? 0) + 1);
    pb.set(b[j], j);
  }
  const cands: Pair[] = [];
  for (let i = a0; i < a1; i++) {
    const v = a[i];
    if (ca.get(v) === 1 && cb.get(v) === 1) cands.push([i, pb.get(v)!]);
  }
  const anchors = lis(cands);
  if (!anchors.length) return greedy(a, b, a0, a1, b0, b1, out);
  let pi = a0;
  let pj = b0;
  for (const [i, j] of anchors) {
    rec(a, b, pi, i, pj, j, out);
    out.push([i, j]);
    pi = i + 1;
    pj = j + 1;
  }
  rec(a, b, pi, a1, pj, b1, out);
}

/** Maior subsequência crescente pelo segundo índice (os pares já vêm ordenados pelo primeiro). */
function lis(pairs: Pair[]): Pair[] {
  const tails: number[] = [];
  const prev = new Int32Array(pairs.length);
  for (let k = 0; k < pairs.length; k++) {
    const v = pairs[k][1];
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pairs[tails[mid]][1] < v) lo = mid + 1;
      else hi = mid;
    }
    prev[k] = lo > 0 ? tails[lo - 1] : -1;
    tails[lo] = k;
  }
  const res: Pair[] = [];
  let k = tails.length ? tails[tails.length - 1] : -1;
  while (k >= 0) {
    res.push(pairs[k]);
    k = prev[k];
  }
  return res.reverse();
}

function greedy(a: Int32Array, b: Int32Array, a0: number, a1: number, b0: number, b1: number, out: Pair[]) {
  const pos = new Map<number, number[]>();
  for (let j = b0; j < b1; j++) {
    const l = pos.get(b[j]);
    if (l) l.push(j);
    else pos.set(b[j], [j]);
  }
  let last = b0 - 1;
  for (let i = a0; i < a1; i++) {
    const l = pos.get(a[i]);
    if (!l) continue;
    let lo = 0;
    let hi = l.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (l[mid] <= last) lo = mid + 1;
      else hi = mid;
    }
    if (lo < l.length) {
      last = l[lo];
      out.push([i, last]);
    }
  }
}

/**
 * Sequência final de pares na ordem do resultado. Entre elementos idênticos, os restantes
 * são pareados por posição (serão comparados campo a campo).
 */
export function alignByContent(ta: Int32Array, sb: Int32Array): Pair[] {
  const eq = matchEqual(ta, sb);
  const res: Pair[] = [];
  let i = 0;
  let j = 0;
  const gap = (iEnd: number, jEnd: number) => {
    while (i < iEnd && j < jEnd) res.push([i++, j++]);
    while (i < iEnd) res.push([i++, -1]);
    while (j < jEnd) res.push([-1, j++]);
  };
  for (const [ei, ej] of eq) {
    gap(ei, ej);
    res.push([i++, j++]);
  }
  gap(ta.length, sb.length);
  return res;
}

/** Converte valores (strings canônicas) em ids inteiros compartilhados entre os dois lados. */
export function internIds(a: string[], b: string[]): [Int32Array, Int32Array] {
  const map = new Map<string, number>();
  const conv = (arr: string[]) => {
    const r = new Int32Array(arr.length);
    for (let k = 0; k < arr.length; k++) {
      let id = map.get(arr[k]);
      if (id === undefined) map.set(arr[k], (id = map.size));
      r[k] = id;
    }
    return r;
  };
  return [conv(a), conv(b)];
}
