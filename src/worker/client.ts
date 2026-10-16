import type { ParseError } from '../core/util';
import type { CompareResult, DocInfo, OpDetail, RenderResult, Request, Response } from './protocol';

export class WorkerError extends Error {
  parse?: ParseError;
  constructor(message: string, parse?: ParseError) {
    super(message);
    this.parse = parse;
  }
}

/** Cliente RPC simples para o worker que guarda os documentos e faz o trabalho pesado. */
export class DiffClient {
  private worker: Worker;
  private seq = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();

  constructor() {
    this.worker = new Worker(new URL('./jsondiff.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev: MessageEvent<{ id: number; res: Response }>) => {
      const p = this.pending.get(ev.data.id);
      if (!p) return;
      this.pending.delete(ev.data.id);
      const r = ev.data.res;
      if (r.ok) p.resolve(r.data);
      else p.reject(new WorkerError(r.error, r.parse));
    };
    this.worker.onerror = (ev) => {
      for (const p of this.pending.values()) p.reject(new WorkerError(ev.message || 'Falha no processamento.'));
      this.pending.clear();
    };
  }

  private call<T>(req: Request): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.postMessage({ id, req });
    });
  }

  load(side: 'A' | 'B', text: string, name: string) {
    return this.call<DocInfo>({ type: 'load', side, text, name });
  }
  compare(req: Omit<Extract<Request, { type: 'compare' }>, 'type'>) {
    return this.call<CompareResult>({ type: 'compare', ...req });
  }
  op(id: number, unit: string) {
    return this.call<OpDetail>({ type: 'op', id, unit });
  }
  render(req: Omit<Extract<Request, { type: 'render' }>, 'type'>) {
    return this.call<RenderResult>({ type: 'render', ...req });
  }
  export(req: Omit<Extract<Request, { type: 'export' }>, 'type'>) {
    return this.call<string>({ type: 'export', ...req });
  }
}
