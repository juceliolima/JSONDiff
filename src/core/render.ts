import { present } from './merge';
import { ST_ACCEPT, ST_EDIT, ST_REJECT, type Decisions, type DNode, type Json } from './types';

/** Marcações de linha na prévia do resultado. */
export const M = {
  NORMAL: 0,
  ADDED: 1, // inserido (aceito)
  GHOST_REMOVED: 2, // removido (aceito) — só aparece na prévia, não no arquivo
  CHANGED: 3, // valor novo (aceito)
  EDITED: 4, // valor editado por você
  PENDING: 5, // valor atual mantido, aguardando decisão
  GHOST_PENDING_ADD: 6, // inserção pendente — só na prévia
  GHOST_OLD: 7, // valor antigo substituído — só na prévia
  REJECTED: 8, // valor atual mantido, mudança rejeitada
} as const;

export const isGhost = (m: number) => m === M.GHOST_REMOVED || m === M.GHOST_PENDING_ADD || m === M.GHOST_OLD;

export interface Rendered {
  text: string; // linhas separadas por \n
  lineCount: number;
  marks: Uint8Array; // marcação por linha
  lineOps: Int32Array; // operação da linha (-1 = nenhuma)
  opLine: Int32Array; // primeira linha de cada operação
}

/** Gera a prévia do arquivo final, com linhas "fantasma" mostrando o que saiu ou ainda está pendente. */
export function render(root: DNode, d: Decisions, opCount: number, unit: string): Rendered {
  const lines: string[] = [];
  const marks: number[] = [];
  const ops: number[] = [];
  const opLine = new Int32Array(opCount).fill(-1);
  const u = unit || '  ';

  const emit = (text: string, mark: number, op: number) => {
    lines.push(text);
    marks.push(mark);
    ops.push(op);
  };

  const value = (v: Json, ind: string, prefix: string, comma: string, mark: number, op: number) => {
    if (op >= 0 && opLine[op] < 0) opLine[op] = lines.length;
    const s = JSON.stringify(v, null, u);
    if (s.indexOf('\n') < 0) return emit(ind + prefix + s + comma, mark, op);
    const parts = s.split('\n');
    emit(ind + prefix + parts[0], mark, op);
    for (let i = 1; i < parts.length - 1; i++) emit(ind + parts[i], mark, op);
    emit(ind + parts[parts.length - 1] + comma, mark, op);
  };

  const node = (n: DNode, ind: string, prefix: string, comma: string, parentOp: number) => {
    switch (n.k) {
      case 'eq':
        return value(n.v, ind, prefix, comma, M.NORMAL, parentOp);
      case 'add': {
        const st = d.status[n.op];
        if (st === ST_ACCEPT) return value(n.v, ind, prefix, comma, M.ADDED, n.op);
        if (st === ST_EDIT) return value(d.edits.get(n.op) ?? n.v, ind, prefix, comma, M.EDITED, n.op);
        if (st === ST_REJECT) {
          opLine[n.op] = lines.length;
          return;
        }
        return value(n.v, ind, prefix, '', M.GHOST_PENDING_ADD, n.op);
      }
      case 'del': {
        const st = d.status[n.op];
        if (st === ST_ACCEPT) return value(n.v, ind, prefix, '', M.GHOST_REMOVED, n.op);
        if (st === ST_EDIT) return value(d.edits.get(n.op) ?? n.v, ind, prefix, comma, M.EDITED, n.op);
        return value(n.v, ind, prefix, comma, st === ST_REJECT ? M.REJECTED : M.PENDING, n.op);
      }
      case 'chg': {
        const st = d.status[n.op];
        if (st === ST_ACCEPT || st === ST_EDIT) {
          value(n.from, ind, prefix, '', M.GHOST_OLD, n.op);
          return st === ST_ACCEPT
            ? value(n.to, ind, prefix, comma, M.CHANGED, n.op)
            : value(d.edits.get(n.op) ?? n.to, ind, prefix, comma, M.EDITED, n.op);
        }
        return value(n.from, ind, prefix, comma, st === ST_REJECT ? M.REJECTED : M.PENDING, n.op);
      }
      case 'obj':
      case 'arr': {
        const children = n.k === 'obj' ? n.entries.map((e) => e.node) : n.items;
        let last = -1;
        for (let i = 0; i < children.length; i++) if (present(children[i], d)) last = i;
        emit(ind + prefix + (n.k === 'obj' ? '{' : '['), M.NORMAL, -1);
        const ci = ind + u;
        for (let i = 0; i < children.length; i++) {
          const c = children[i];
          const p = n.k === 'obj' ? JSON.stringify(n.entries[i].key) + ': ' : '';
          node(c, ci, p, i < last ? ',' : '', -1);
        }
        emit(ind + (n.k === 'obj' ? '}' : ']') + comma, M.NORMAL, -1);
        return;
      }
    }
  };

  node(root, '', '', '', -1);
  return {
    text: lines.join('\n'),
    lineCount: lines.length,
    marks: Uint8Array.from(marks),
    lineOps: Int32Array.from(ops),
    opLine,
  };
}
