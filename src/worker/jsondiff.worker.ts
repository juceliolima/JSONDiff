/// <reference lib="webworker" />
import { diff, type DiffResult } from '../core/diff';
import { merge, MISSING, serialize } from '../core/merge';
import { render } from '../core/render';
import type { Decisions, Json } from '../core/types';
import { detectFormat, inspect, parseJson, typeName, type ParseError } from '../core/util';
import { structureChildren } from '../core/pattern';
import type { CompareResult, DocInfo, OpDetail, Request, Response, Side, StructureResult, WireDecisions } from './protocol';

const docs: Partial<Record<Side, { value: Json; info: DocInfo }>> = {};
let current: DiffResult | null = null;

const DETAIL_LIMIT = 400_000;

function toDecisions(w: WireDecisions): Decisions {
  const edits = new Map<number, Json>();
  for (const [id, text] of w.edits) edits.set(id, JSON.parse(text) as Json);
  return { status: w.status, edits };
}

function handle(req: Request): { data: unknown; transfer?: Transferable[] } {
  switch (req.type) {
    case 'load': {
      const parsed = parseJson(req.text);
      if ('error' in parsed) throw Object.assign(new Error('JSON inválido'), { parse: parsed.error });
      const { stats, warnings } = inspect(parsed.value);
      const info: DocInfo = {
        name: req.name,
        size: req.text.length,
        format: detectFormat(req.text),
        stats,
        warnings,
        rootType: typeName(parsed.value),
      };
      docs[req.side] = { value: parsed.value, info };
      current = null;
      return { data: info };
    }
    case 'compare': {
      const a = docs.A;
      const b = docs.B;
      if (!a || !b) throw new Error('Carregue os dois arquivos antes de comparar.');
      const t0 = performance.now();
      const [target, source] = req.direction === 'BtoA' ? [a.value, b.value] : [b.value, a.value];
      current = diff(target, source, { strategies: req.strategies, exclude: req.exclude, excludeMode: req.excludeMode });
      const res: CompareResult = { ops: current.ops, arrays: current.arrays, ms: Math.round(performance.now() - t0) };
      return { data: res };
    }
    case 'structure': {
      const list = [docs.A?.value, docs.B?.value].filter((v): v is Json => v !== undefined);
      const res: StructureResult = structureChildren(list, req.pattern);
      return { data: res };
    }
    case 'op': {
      if (!current) throw new Error('Nenhuma comparação ativa.');
      const n = current.opNodes[req.id];
      const fmt = (v: Json) => JSON.stringify(v, null, req.unit || '  ');
      let fromText: string | undefined;
      let toText: string | undefined;
      if (n.k === 'chg') {
        fromText = fmt(n.from);
        toText = fmt(n.to);
      } else if (n.k === 'add') toText = fmt(n.v);
      else if (n.k === 'del') fromText = fmt(n.v);
      let truncated = false;
      const cut = (s?: string) => {
        if (s && s.length > DETAIL_LIMIT) {
          truncated = true;
          return s.slice(0, DETAIL_LIMIT);
        }
        return s;
      };
      const res: OpDetail = { fromText: cut(fromText), toText: cut(toText), truncated };
      return { data: res };
    }
    case 'render': {
      if (!current) throw new Error('Nenhuma comparação ativa.');
      const r = render(current.root, toDecisions(req.decisions), current.ops.length, req.unit);
      return { data: r, transfer: [r.marks.buffer, r.lineOps.buffer, r.opLine.buffer] };
    }
    case 'export': {
      if (!current) throw new Error('Nenhuma comparação ativa.');
      const v = merge(current.root, toDecisions(req.decisions));
      if (v === MISSING) throw new Error('Resultado vazio.');
      return { data: serialize(v, req.indent, req.eol, req.finalNewline) };
    }
  }
}

self.onmessage = (ev: MessageEvent<{ id: number; req: Request }>) => {
  const { id, req } = ev.data;
  let res: Response;
  let transfer: Transferable[] = [];
  try {
    const out = handle(req);
    res = { ok: true, data: out.data };
    transfer = out.transfer ?? [];
  } catch (e) {
    const err = e as Error & { parse?: ParseError };
    res = { ok: false, error: err?.message ?? String(e), parse: err?.parse };
  }
  (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, res }, transfer);
};
