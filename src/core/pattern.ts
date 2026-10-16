import type { Json } from './types';
import { hasOwn, isObj, keySeg, typeName } from './util';

/** Segmento de caminho genérico: nome de chave ou `*` (todos os itens de uma lista). */
export type Seg = { key: string } | { any: true };

/**
 * Lê um caminho como `$.clientes[*].endereco` ou `$["chave com espaço"].x`.
 * Aceita também formas digitadas à mão: sem `$`, `[0]`/`[]` no lugar de `[*]`.
 */
export function parsePattern(input: string): Seg[] | null {
  let s = input.trim();
  if (!s) return null;
  if (s.startsWith('$')) s = s.slice(1);
  else if (!s.startsWith('.') && !s.startsWith('[')) s = '.' + s;
  const segs: Seg[] = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === '.') {
      const m = /^\.([^.[\]]+)/.exec(s.slice(i));
      if (!m) return null;
      segs.push({ key: m[1] });
      i += m[0].length;
    } else if (s[i] === '[') {
      const rest = s.slice(i);
      const any = /^\[\s*(\*|\d*)\s*\]/.exec(rest);
      if (any) {
        segs.push({ any: true });
        i += any[0].length;
        continue;
      }
      const str = /^\[\s*("(?:[^"\\]|\\.)*")\s*\]/.exec(rest);
      if (!str) return null;
      segs.push({ key: JSON.parse(str[1]) as string });
      i += str[0].length;
    } else return null;
  }
  return segs;
}

export function formatPattern(segs: Seg[]): string {
  return '$' + segs.map((s) => ('any' in s ? '[*]' : keySeg(s.key))).join('');
}

/** Normaliza um caminho digitado para o formato usado internamente (ou null se inválido). */
export function normalizePattern(input: string): string | null {
  const segs = parsePattern(input);
  return segs && segs.length ? formatPattern(segs) : null;
}

export interface StructChild {
  key: string; // nome da chave, ou '[*]' para os itens de uma lista
  pattern: string;
  isItems: boolean;
  types: string[];
  counts: number[]; // ocorrências em cada documento (A, B)
  expandable: boolean;
}

const SAMPLE_LIMIT = 20000;

/** Valores do documento que correspondem ao caminho (limitado a uma amostra). */
export function collect(doc: Json, segs: Seg[], limit = SAMPLE_LIMIT): { values: Json[]; truncated: boolean } {
  let cur: Json[] = [doc];
  let truncated = false;
  for (const seg of segs) {
    const next: Json[] = [];
    for (const v of cur) {
      if ('any' in seg) {
        if (Array.isArray(v)) for (const e of v) next.push(e);
      } else if (isObj(v) && hasOwn(v, seg.key)) next.push(v[seg.key]);
      if (next.length > limit) {
        truncated = true;
        next.length = limit;
        break;
      }
    }
    cur = next;
  }
  return { values: cur, truncated };
}

/** Filhos (chaves ou itens de lista) de um caminho, unindo o que aparece nos dois documentos. */
export function structureChildren(docs: Json[], pattern: string): { children: StructChild[]; sampled: boolean } {
  const segs = parsePattern(pattern) ?? [];
  const map = new Map<string, StructChild>();
  let sampled = false;
  docs.forEach((doc, di) => {
    const { values, truncated } = collect(doc, segs);
    if (truncated) sampled = true;
    for (const v of values) {
      if (Array.isArray(v)) {
        const c = get(map, '[*]', pattern + '[*]', true, docs.length);
        c.counts[di]++;
        for (const e of v.length > 200 ? v.slice(0, 200) : v) addType(c, e);
      } else if (isObj(v)) {
        for (const k of Object.keys(v)) {
          const c = get(map, k, pattern + keySeg(k), false, docs.length);
          c.counts[di]++;
          addType(c, v[k]);
        }
      }
    }
  });
  return { children: [...map.values()], sampled };
}

function get(map: Map<string, StructChild>, key: string, pattern: string, isItems: boolean, n: number) {
  let c = map.get(key);
  if (!c) map.set(key, (c = { key, pattern, isItems, types: [], counts: new Array<number>(n).fill(0), expandable: false }));
  return c;
}

function addType(c: StructChild, v: Json) {
  const t = typeName(v);
  if (!c.types.includes(t)) c.types.push(t);
  if (t === 'object' || t === 'array') c.expandable = true;
}
