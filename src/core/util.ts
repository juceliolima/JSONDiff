import type { DocStats, FormatInfo, Json, JsonObject } from './types';

export const isObj = (v: Json): v is JsonObject => v !== null && typeof v === 'object' && !Array.isArray(v);

export function typeName(v: Json): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

const IDENT = /^[A-Za-z_$][\w$]*$/;
export const keySeg = (k: string) => (IDENT.test(k) ? '.' + k : '[' + JSON.stringify(k) + ']');

export function hasOwn(o: JsonObject, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, k);
}

/** Define a chave sem acionar o setter de __proto__. */
export function setKey(o: JsonObject, k: string, v: Json) {
  if (k === '__proto__') Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
  else o[k] = v;
}

/** Serialização curta e limitada (não percorre o valor inteiro se ele for enorme). */
export function preview(v: Json, max = 140): string {
  let out = '';
  const STOP = {};
  const w = (s: string) => {
    out += s;
    if (out.length > max) throw STOP;
  };
  const rec = (x: Json) => {
    if (x === null || typeof x !== 'object') return w(JSON.stringify(x));
    if (Array.isArray(x)) {
      w('[');
      for (let i = 0; i < x.length; i++) {
        if (i) w(', ');
        rec(x[i]);
      }
      return w(']');
    }
    w('{');
    let first = true;
    for (const k of Object.keys(x)) {
      if (!first) w(', ');
      first = false;
      w(JSON.stringify(k) + ': ');
      rec(x[k]);
    }
    w('}');
  };
  try {
    rec(v);
  } catch (e) {
    if (e !== STOP) throw e;
    return out.slice(0, max) + '…';
  }
  return out;
}

/** Serialização canônica (chaves ordenadas) — usada para comparar elementos por conteúdo. */
export function canonical(v: Json): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  const keys = Object.keys(v).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
}

export function detectFormat(text: string): FormatInfo {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const m = /\n([ \t]+)\S/.exec(text);
  let indent = '';
  if (m) indent = m[1][0] === '\t' ? '\t' : ' '.repeat(Math.min(m[1].length, 8));
  else if (/\n/.test(text.trim())) indent = '  ';
  return { indent, eol, finalNewline: /\n\s*$/.test(text) };
}

export interface ParseError {
  message: string;
  line?: number;
  column?: number;
  context?: string;
}

export function parseJson(text: string): { value: Json } | { error: ParseError } {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  try {
    return { value: JSON.parse(text) as Json };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    let pos: number | undefined;
    const p = /position (\d+)/.exec(msg);
    if (p) pos = Number(p[1]);
    const lc = /line (\d+) column (\d+)/.exec(msg);
    let line: number | undefined;
    let column: number | undefined;
    if (lc) {
      line = Number(lc[1]);
      column = Number(lc[2]);
    } else if (pos !== undefined) {
      const before = text.slice(0, pos);
      line = before.split('\n').length;
      column = pos - before.lastIndexOf('\n');
    }
    let context: string | undefined;
    if (line !== undefined) {
      let start = 0;
      for (let i = 1; i < line; i++) start = text.indexOf('\n', start) + 1;
      const end = text.indexOf('\n', start);
      context = text.slice(start, end < 0 ? undefined : end).slice(0, 200);
    }
    return { error: { message: msg, line, column, context } };
  }
}

const INT_KEY = /^(0|[1-9]\d{0,9})$/;

/** Estatísticas + avisos sobre coisas que JSON.parse do navegador não preserva. */
export function inspect(v: Json): { stats: DocStats; warnings: string[] } {
  const stats: DocStats = { objects: 0, arrays: 0, keys: 0, maxDepth: 0 };
  let intKeys = 0;
  let bigNums = 0;
  const stack: [Json, number][] = [[v, 0]];
  while (stack.length) {
    const [x, d] = stack.pop()!;
    if (d > stats.maxDepth) stats.maxDepth = d;
    if (Array.isArray(x)) {
      stats.arrays++;
      for (const e of x) {
        if (e !== null && typeof e === 'object') stack.push([e, d + 1]);
        else if (typeof e === 'number' && Number.isInteger(e) && !Number.isSafeInteger(e)) bigNums++;
      }
    } else if (x !== null && typeof x === 'object') {
      stats.objects++;
      for (const k of Object.keys(x)) {
        stats.keys++;
        if (INT_KEY.test(k)) intKeys++;
        const e = x[k];
        if (e !== null && typeof e === 'object') stack.push([e, d + 1]);
        else if (typeof e === 'number' && Number.isInteger(e) && !Number.isSafeInteger(e)) bigNums++;
      }
    }
  }
  if (typeof v === 'number' && Number.isInteger(v) && !Number.isSafeInteger(v)) bigNums++;
  const warnings: string[] = [];
  if (intKeys)
    warnings.push(
      `${intKeys} chave(s) numéricas (ex.: "1", "2"): o navegador as coloca no início do objeto, então a ordem dessas chaves pode mudar ao salvar.`,
    );
  if (bigNums)
    warnings.push(
      `${bigNums} número(s) inteiro(s) maiores que 9007199254740991: podem perder precisão ao salvar.`,
    );
  return { stats, warnings };
}
