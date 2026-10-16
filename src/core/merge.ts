import { ST_ACCEPT, ST_EDIT, type Decisions, type DNode, type Json, type JsonObject } from './types';
import { setKey } from './util';

export const MISSING: unique symbol = Symbol('missing');
type Out = Json | typeof MISSING;

/** Constrói o documento final aplicando sobre o destino as decisões tomadas. Pendentes = não aplicadas. */
export function merge(node: DNode, d: Decisions): Out {
  switch (node.k) {
    case 'eq':
      return node.v;
    case 'add': {
      const st = d.status[node.op];
      if (st === ST_ACCEPT) return node.v;
      if (st === ST_EDIT) return d.edits.get(node.op) ?? node.v;
      return MISSING;
    }
    case 'del': {
      const st = d.status[node.op];
      if (st === ST_ACCEPT) return MISSING;
      if (st === ST_EDIT) return d.edits.get(node.op) ?? node.v;
      return node.v;
    }
    case 'chg': {
      const st = d.status[node.op];
      if (st === ST_ACCEPT) return node.to;
      if (st === ST_EDIT) return d.edits.get(node.op) ?? node.to;
      return node.from;
    }
    case 'obj': {
      const o: JsonObject = {};
      for (const { key, node: c } of node.entries) {
        const v = merge(c, d);
        if (v !== MISSING) setKey(o, key, v);
      }
      return o;
    }
    case 'arr': {
      const a: Json[] = [];
      for (const c of node.items) {
        const v = merge(c, d);
        if (v !== MISSING) a.push(v);
      }
      return a;
    }
  }
}

/** O nó gera conteúdo no arquivo final? (barato — não percorre a subárvore) */
export function present(node: DNode, d: Decisions): boolean {
  switch (node.k) {
    case 'add':
      return d.status[node.op] === ST_ACCEPT || d.status[node.op] === ST_EDIT;
    case 'del':
      return d.status[node.op] !== ST_ACCEPT;
    default:
      return true;
  }
}

export function serialize(value: Json, indent: string, eol: '\n' | '\r\n', finalNewline: boolean): string {
  let text = JSON.stringify(value, null, indent || undefined);
  if (eol === '\r\n') text = text.replace(/\n/g, '\r\n');
  if (finalNewline) text += eol;
  return text;
}
