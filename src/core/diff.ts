import { alignByContent, internIds, type Pair } from './align';
import type { ArrayInfo, ArrayStrategy, DNode, Json, JsonObject, Kind, OpSummary } from './types';
import { canonical, hasOwn, isObj, keySeg, preview, typeName } from './util';

export interface DiffOptions {
  /** Estratégia por padrão de caminho do array (ex.: "$.usuarios"). Ausente = automático. */
  strategies?: Record<string, ArrayStrategy>;
  /** Caminhos genéricos excluídos da comparação (ex.: "$.clientes[*].endereco"). */
  exclude?: string[];
  /** 'keep' = partes excluídas ficam como estão no destino; 'remove' = saem do resultado. */
  excludeMode?: 'keep' | 'remove';
}

export interface DiffResult {
  root: DNode;
  ops: OpSummary[];
  /** Nó de cada operação, indexado pelo id. */
  opNodes: DNode[];
  arrays: ArrayInfo[];
}

/** Nomes preferidos para campo identificador, em ordem de prioridade. */
const PREFERRED_KEYS = [
  'id', '_id', 'uuid', 'guid', 'key', 'chave', 'codigo', 'código', 'cod', 'code',
  'cpf', 'cnpj', 'nb', 'sku', 'slug', 'name', 'nome',
];

/**
 * Compara `target` (destino, arquivo que será modificado) com `source` (origem das mudanças).
 */
export function diff(target: Json, source: Json, opts: DiffOptions = {}): DiffResult {
  const strategies = opts.strategies ?? {};
  const excluded = new Set(opts.exclude ?? []);
  const removeExcluded = opts.excludeMode === 'remove';
  const ops: OpSummary[] = [];
  const opNodes: DNode[] = [];
  const arrays = new Map<string, ArrayInfo>();

  const mkOp = (kind: Kind, path: string, pattern: string, depth: number, from: Json | undefined, to: Json | undefined): DNode => {
    if (removeExcluded && excluded.size) {
      // valores inseridos/mantidos inteiros também não devem levar as partes excluídas
      if (from !== undefined) from = stripExcluded(from, pattern, excluded);
      if (to !== undefined) to = stripExcluded(to, pattern, excluded);
    }
    const id = ops.length;
    const s: OpSummary = { id, kind, path, pattern, depth };
    if (from !== undefined) {
      s.from = preview(from);
      s.fromType = typeName(from);
    }
    if (to !== undefined) {
      s.to = preview(to);
      s.toType = typeName(to);
    }
    ops.push(s);
    const node: DNode =
      kind === 'add' ? { k: 'add', op: id, v: to! } : kind === 'del' ? { k: 'del', op: id, v: from! } : { k: 'chg', op: id, from: from!, to: to! };
    opNodes.push(node);
    return node;
  };

  const walk = (t: Json, s: Json, path: string, pattern: string, depth: number): DNode => {
    if (isObj(t) && isObj(s)) return walkObject(t, s, path, pattern, depth);
    if (Array.isArray(t) && Array.isArray(s)) return walkArray(t, s, path, pattern, depth);
    if (t === s) return { k: 'eq', v: t };
    return mkOp('chg', path, pattern, depth, t, s);
  };

  const walkObject = (t: JsonObject, s: JsonObject, path: string, pattern: string, depth: number): DNode => {
    const tKeys = Object.keys(t);
    const sKeys = Object.keys(s);
    // ordem do resultado: chaves do destino; chaves novas entram logo após a chave que as precede na origem
    const after = new Map<string | null, string[]>();
    let anchor: string | null = null;
    for (const k of sKeys) {
      if (hasOwn(t, k)) anchor = k;
      else {
        const l = after.get(anchor);
        if (l) l.push(k);
        else after.set(anchor, [k]);
      }
    }
    const order: string[] = [...(after.get(null) ?? [])];
    for (const k of tKeys) {
      order.push(k);
      const l = after.get(k);
      if (l) order.push(...l);
    }
    const entries: { key: string; node: DNode }[] = [];
    let allEq = true;
    for (const k of order) {
      const p = path + keySeg(k);
      const pat = pattern + keySeg(k);
      const inT = hasOwn(t, k);
      const inS = hasOwn(s, k);
      if (excluded.has(pat)) {
        // fora da comparação: mantém o valor do destino ou remove do resultado
        if (!inT) continue;
        if (removeExcluded) allEq = false;
        else entries.push({ key: k, node: { k: 'eq', v: t[k] } });
        continue;
      }
      let node: DNode;
      if (inT && inS) node = walk(t[k], s[k], p, pat, depth + 1);
      else if (inT) node = mkOp('del', p, pat, depth + 1, t[k], undefined);
      else node = mkOp('add', p, pat, depth + 1, undefined, s[k]);
      if (node.k !== 'eq') allEq = false;
      entries.push({ key: k, node });
    }
    return allEq ? { k: 'eq', v: t } : { k: 'obj', entries };
  };

  const walkArray = (t: Json[], s: Json[], path: string, pattern: string, depth: number): DNode => {
    const { pairs, label } = matchArray(t, s, pattern);
    const items: DNode[] = [];
    let allEq = true;
    const itemPattern = pattern + '[*]';
    for (const [ti, sj] of pairs) {
      let node: DNode;
      if (ti >= 0 && sj >= 0) node = walk(t[ti], s[sj], path + label(ti, sj), itemPattern, depth + 1);
      else if (ti >= 0) node = mkOp('del', path + label(ti, -1), itemPattern, depth + 1, t[ti], undefined);
      else node = mkOp('add', path + label(-1, sj), itemPattern, depth + 1, undefined, s[sj]);
      if (node.k !== 'eq') allEq = false;
      items.push(node);
    }
    return allEq ? { k: 'eq', v: t } : { k: 'arr', items };
  };

  const matchArray = (t: Json[], s: Json[], pattern: string): { pairs: Pair[]; label: (ti: number, sj: number) => string } => {
    const strat = strategies[pattern] ?? { mode: 'auto' };
    const { candidates, unique } = keyCandidates(t, s);
    let mode: 'key' | 'content' | 'index';
    let key: string | undefined;
    if (strat.mode === 'key') {
      mode = 'key';
      key = strat.key;
    } else if (strat.mode === 'auto') {
      key = pickKey(unique);
      mode = key ? 'key' : 'content';
    } else mode = strat.mode;

    // registro para a tela de configuração de arrays
    const info = arrays.get(pattern);
    if (!info) {
      arrays.set(pattern, {
        pattern, occurrences: 1, candidates, uniqueCandidates: unique, mode, key, auto: strat.mode === 'auto',
      });
    } else {
      info.occurrences++;
      for (const c of candidates) if (!info.candidates.includes(c)) info.candidates.push(c);
      info.uniqueCandidates = info.uniqueCandidates.filter((c) => unique.includes(c) || !candidates.includes(c));
      if (info.mode !== mode || info.key !== key) info.mixed = true;
    }

    if (mode === 'key' && key) {
      const k = key;
      return {
        pairs: alignByKey(t, s, k),
        label: (ti, sj) => {
          const el = ti >= 0 ? t[ti] : s[sj];
          if (isObj(el) && hasOwn(el, k)) return `[${k}=${JSON.stringify(el[k])}]`;
          return ti >= 0 ? `[${ti}]` : `[+${sj}]`;
        },
      };
    }
    const label = (ti: number, sj: number) => (ti >= 0 ? `[${ti}]` : `[+${sj}]`);
    if (mode === 'index') {
      const pairs: Pair[] = [];
      const n = Math.max(t.length, s.length);
      for (let i = 0; i < n; i++) pairs.push([i < t.length ? i : -1, i < s.length ? i : -1]);
      return { pairs, label };
    }
    const canon = excluded.size ? (v: Json) => canonicalEx(v, itemPatternOf(pattern), excluded) : canonical;
    const [ta, sb] = internIds(t.map(canon), s.map(canon));
    return { pairs: alignByContent(ta, sb), label };
  };

  const root = walk(target, source, '$', '$', 0);
  return { root, ops, opNodes, arrays: [...arrays.values()] };
}

const itemPatternOf = (arrayPattern: string) => arrayPattern + '[*]';

/** Serialização canônica ignorando os caminhos excluídos (para o alinhamento por conteúdo). */
function canonicalEx(v: Json, pattern: string, excluded: Set<string>): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map((e) => canonicalEx(e, pattern + '[*]', excluded)).join(',') + ']';
  const keys = Object.keys(v)
    .filter((k) => !excluded.has(pattern + keySeg(k)))
    .sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalEx(v[k], pattern + keySeg(k), excluded)).join(',') + '}';
}

/** Cópia do valor sem os caminhos excluídos (só copia o que precisa mudar). */
function stripExcluded(v: Json, pattern: string, excluded: Set<string>): Json {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) {
    let changed = false;
    const out = v.map((e) => {
      const r = stripExcluded(e, pattern + '[*]', excluded);
      if (r !== e) changed = true;
      return r;
    });
    return changed ? out : v;
  }
  let out: JsonObject | null = null;
  for (const k of Object.keys(v)) {
    const p = pattern + keySeg(k);
    if (excluded.has(p)) {
      out ??= { ...v };
      delete out[k];
      continue;
    }
    const r = stripExcluded(v[k], p, excluded);
    if (r !== v[k]) {
      out ??= { ...v };
      out[k] = r;
    }
  }
  return out ?? v;
}

const isKeyValue = (v: Json) => typeof v === 'string' || typeof v === 'number';
const keyOf = (v: Json) => (typeof v === 'string' ? 's' + v : 'n' + String(v));

/** Campos (string/número) presentes em todos os objetos dos dois arrays e quais são únicos. */
export function keyCandidates(t: Json[], s: Json[]): { candidates: string[]; unique: string[] } {
  const all = t.concat(s);
  if (!all.length || !all.every(isObj)) return { candidates: [], unique: [] };
  const objs = all as JsonObject[];
  let cands = Object.keys(objs[0]).filter((k) => isKeyValue(objs[0][k]));
  for (let i = 1; i < objs.length && cands.length; i++) {
    const o = objs[i];
    cands = cands.filter((k) => hasOwn(o, k) && isKeyValue(o[k]));
  }
  const isUnique = (arr: Json[], k: string) => {
    const seen = new Set<string>();
    for (const o of arr as JsonObject[]) {
      const v = keyOf(o[k]);
      if (seen.has(v)) return false;
      seen.add(v);
    }
    return true;
  };
  const unique = cands.filter((k) => isUnique(t, k) && isUnique(s, k));
  return { candidates: cands, unique };
}

function pickKey(unique: string[]): string | undefined {
  if (!unique.length) return undefined;
  const lower = unique.map((k) => k.toLowerCase());
  for (const p of PREFERRED_KEYS) {
    const i = lower.indexOf(p);
    if (i >= 0) return unique[i];
  }
  // campos terminados em "id"/"Id"/"_id"/"codigo"
  const byName = unique.find((k) => /(^|_|[a-z])(id|Id|ID|codigo|Codigo)$/.test(k));
  return byName;
}

/** Pareia elementos pelo valor do campo-chave. Ordem: a do destino; novos entram após o anterior da origem. */
export function alignByKey(t: Json[], s: Json[], key: string): Pair[] {
  const idx = new Map<string, number[]>();
  t.forEach((el, i) => {
    if (isObj(el) && hasOwn(el, key) && isKeyValue(el[key])) {
      const k = keyOf(el[key]);
      const l = idx.get(k);
      if (l) l.push(i);
      else idx.set(k, [i]);
    }
  });
  const matchOfT = new Int32Array(t.length).fill(-1);
  const after = new Map<number, number[]>(); // índice do destino (-1 = início) → origens novas
  let anchor = -1;
  s.forEach((el, j) => {
    let ti = -1;
    if (isObj(el) && hasOwn(el, key) && isKeyValue(el[key])) {
      const l = idx.get(keyOf(el[key]));
      if (l && l.length) ti = l.shift()!;
    }
    if (ti >= 0) {
      matchOfT[ti] = j;
      anchor = ti;
    } else {
      const l = after.get(anchor);
      if (l) l.push(j);
      else after.set(anchor, [j]);
    }
  });
  const pairs: Pair[] = [];
  for (const j of after.get(-1) ?? []) pairs.push([-1, j]);
  for (let i = 0; i < t.length; i++) {
    pairs.push([i, matchOfT[i]]);
    for (const j of after.get(i) ?? []) pairs.push([-1, j]);
  }
  return pairs;
}
