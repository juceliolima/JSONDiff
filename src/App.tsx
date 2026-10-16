import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ST_ACCEPT, ST_EDIT, ST_PENDING, ST_REJECT, type ArrayStrategy, type Kind, type Status } from './core/types';
import type { ParseError } from './core/util';
import { ArraysPanel } from './ui/ArraysPanel';
import { SaveDialog, PasteDialog, type SaveOptions } from './ui/Dialogs';
import { DiffList, KIND_LABEL } from './ui/DiffList';
import { FileSlot } from './ui/FileSlot';
import { fmtNum } from './ui/format';
import { ResultView, buildLineNumbers, type ResultData } from './ui/ResultView';
import { ReviewPanel } from './ui/ReviewPanel';
import { SAMPLE_A, SAMPLE_B } from './ui/sample';
import { DiffClient, WorkerError } from './worker/client';
import type { CompareResult, Direction, DocInfo, OpDetail, Side } from './worker/protocol';

type Tab = 'review' | 'result' | 'arrays';
type StFilter = 'all' | Status;

/** Busca binária: posição de `id` em `ids` (ordenado) ou ponto de inserção. */
function lowerBound(ids: number[], id: number) {
  let lo = 0;
  let hi = ids.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (ids[m] < id) lo = m + 1;
    else hi = m;
  }
  return lo;
}

export default function App() {
  const client = useMemo(() => new DiffClient(), []);

  // ---------- arquivos ----------
  const [docs, setDocs] = useState<Partial<Record<Side, DocInfo>>>({});
  const [loading, setLoading] = useState<Partial<Record<Side, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<Side, { message: string; parse?: ParseError }>>>({});
  const [paste, setPaste] = useState<Side | null>(null);
  const [direction, setDirection] = useState<Direction>('BtoA');

  // ---------- comparação ----------
  const [strategies, setStrategies] = useState<Record<string, ArrayStrategy>>({});
  const [cmp, setCmp] = useState<CompareResult | null>(null);
  const [view, setView] = useState<'setup' | 'review'>('setup');
  const [comparing, setComparing] = useState(false);
  const [cmpError, setCmpError] = useState<string | null>(null);

  // decisões ficam num ref (podem ser centenas de milhares); `ver` força re-render
  const dec = useRef<{ status: Uint8Array; edits: Map<number, string> }>({ status: new Uint8Array(0), edits: new Map() });
  const [ver, setVer] = useState(0);
  const bump = () => setVer((v) => v + 1);

  // ---------- revisão ----------
  const [selected, setSelected] = useState<number | null>(null);
  const [kinds, setKinds] = useState<Record<Kind, boolean>>({ add: true, del: true, chg: true });
  const [stFilter, setStFilter] = useState<StFilter>('all');
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const [tab, setTab] = useState<Tab>('review');
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [detailState, setDetail] = useState<(OpDetail & { id: number; cmp: CompareResult }) | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [listScroll, setListScroll] = useState<{ index: number; nonce: number } | null>(null);
  const [resultScroll, setResultScroll] = useState<{ index: number; nonce: number } | null>(null);
  const [result, setResult] = useState<ResultData | null>(null);
  const [resultBusy, setResultBusy] = useState(false);
  const [editReq, setEditReq] = useState(0);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const dst: Side = direction === 'BtoA' ? 'A' : 'B';
  const src: Side = direction === 'BtoA' ? 'B' : 'A';
  const unit = docs[dst]?.format.indent || '  ';

  const flash = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((t) => (t === m ? null : t)), 2600);
  }, []);

  // ---------- carregar ----------
  const loadText = useCallback(
    async (side: Side, text: string, name: string) => {
      setLoading((l) => ({ ...l, [side]: true }));
      setErrors((e) => ({ ...e, [side]: undefined }));
      setCmp(null);
      setResult(null);
      try {
        const info = await client.load(side, text, name);
        setDocs((d) => ({ ...d, [side]: info }));
      } catch (e) {
        const err = e as WorkerError;
        setDocs((d) => ({ ...d, [side]: undefined }));
        setErrors((x) => ({ ...x, [side]: { message: err.message, parse: err.parse } }));
      } finally {
        setLoading((l) => ({ ...l, [side]: false }));
      }
    },
    [client],
  );

  const confirmDiscard = () =>
    !cmp ||
    !dec.current.status.some((s) => s !== ST_PENDING) ||
    window.confirm('Trocar um arquivo descarta a comparação atual e as decisões já tomadas. Continuar?');

  const onFiles = useCallback(
    async (side: Side, files: File[]) => {
      if (!confirmDiscard()) return;
      if (files.length >= 2) {
        const [fa, fb] = files;
        await Promise.all([loadText('A', await fa.text(), fa.name), loadText('B', await fb.text(), fb.name)]);
      } else {
        await loadText(side, await files[0].text(), files[0].name);
      }
    },
    [loadText, cmp],
  );

  // ---------- comparar ----------
  const runCompare = useCallback(
    async (dir: Direction, strats: Record<string, ArrayStrategy>, preserve: boolean) => {
      setComparing(true);
      setCmpError(null);
      const prev = preserve && cmp ? { ops: cmp.ops, d: dec.current } : null;
      try {
        const r = await client.compare({ direction: dir, strategies: strats });
        const status = new Uint8Array(r.ops.length);
        const edits = new Map<number, string>();
        if (prev) {
          const byKey = new Map<string, number>();
          for (const op of prev.ops) if (prev.d.status[op.id] !== ST_PENDING) byKey.set(op.kind + '|' + op.path, op.id);
          for (const op of r.ops) {
            const old = byKey.get(op.kind + '|' + op.path);
            if (old === undefined) continue;
            status[op.id] = prev.d.status[old];
            const ed = prev.d.edits.get(old);
            if (ed !== undefined) edits.set(op.id, ed);
          }
        }
        dec.current = { status, edits };
        setStrategies(strats);
        setCmp(r);
        setView('review');
        setResult(null);
        setSelected(r.ops.length ? 0 : null);
        setListScroll({ index: 0, nonce: Date.now() });
        bump();
      } catch (e) {
        setCmpError((e as Error).message);
      } finally {
        setComparing(false);
      }
    },
    [client, cmp],
  );

  const changeDirection = (d: Direction) => {
    if (d === direction) return;
    if (cmp) {
      const decided = dec.current.status.some((s) => s !== ST_PENDING);
      if (decided && !window.confirm('Trocar a direção recalcula as diferenças e descarta as decisões já tomadas. Continuar?')) return;
      setDirection(d);
      if (view === 'review') runCompare(d, strategies, false);
      else setCmp(null);
    } else setDirection(d);
  };

  // ---------- filtros ----------
  const statusVer = stFilter === 'all' ? 0 : ver;
  const ids = useMemo(() => {
    if (!cmp) return [] as number[];
    const needle = dq.trim().toLowerCase();
    const st = dec.current.status;
    const out: number[] = [];
    for (const op of cmp.ops) {
      if (!kinds[op.kind]) continue;
      if (stFilter !== 'all' && st[op.id] !== stFilter) continue;
      if (
        needle &&
        !op.path.toLowerCase().includes(needle) &&
        !op.from?.toLowerCase().includes(needle) &&
        !op.to?.toLowerCase().includes(needle)
      )
        continue;
      out.push(op.id);
    }
    return out;
  }, [cmp, kinds, stFilter, dq, statusVer]);

  const counts = useMemo(() => {
    const c = [0, 0, 0, 0];
    for (const s of dec.current.status) c[s]++;
    return c;
  }, [ver, cmp]);

  const kindCounts = useMemo(() => {
    const c: Record<Kind, number> = { add: 0, del: 0, chg: 0 };
    for (const op of cmp?.ops ?? []) c[op.kind]++;
    return c;
  }, [cmp]);

  // ---------- seleção e navegação ----------
  const select = useCallback(
    (id: number, opts: { scrollList?: boolean } = {}) => {
      setSelected(id);
      if (opts.scrollList !== false) {
        const pos = lowerBound(ids, id);
        if (ids[pos] === id) setListScroll({ index: pos, nonce: Date.now() });
      }
    },
    [ids],
  );

  const nav = (delta: number) => {
    if (!ids.length) return;
    let pos = selected === null ? -1 : lowerBound(ids, selected);
    if (selected !== null && ids[pos] !== selected && delta > 0) pos -= 1; // selecionado saiu do filtro
    const next = Math.min(ids.length - 1, Math.max(0, pos + delta));
    select(ids[next]);
  };

  const nextPending = (from: number | null) => {
    const st = dec.current.status;
    const start = from === null ? 0 : lowerBound(ids, from + 1);
    for (let k = 0; k < ids.length; k++) {
      const id = ids[(start + k) % ids.length];
      if (st[id] === ST_PENDING && id !== from) return select(id);
    }
    flash('Todas as diferenças visíveis já têm decisão.');
  };

  const setOne = (id: number, st: Status, edited?: string) => {
    dec.current.status[id] = st;
    if (st === ST_EDIT && edited !== undefined) dec.current.edits.set(id, edited);
    else dec.current.edits.delete(id);
    bump();
  };

  const decide = (st: Status, edited?: string) => {
    if (selected === null) return;
    setOne(selected, st, edited);
    if (autoAdvance && st !== ST_PENDING) nextPending(selected);
  };

  const bulk = (st: Status) => {
    if (!ids.length) return;
    const verb = st === ST_ACCEPT ? 'Aceitar' : st === ST_REJECT ? 'Rejeitar' : 'Desfazer a decisão de';
    if (ids.length > 1 && !window.confirm(`${verb} ${fmtNum(ids.length)} diferença(s) visível(is) na lista?`)) return;
    for (const id of ids) {
      dec.current.status[id] = st;
      dec.current.edits.delete(id);
    }
    bump();
  };

  // ---------- detalhe da diferença selecionada ----------
  useEffect(() => {
    if (selected === null || !cmp) {
      setDetail(null);
      return;
    }
    let alive = true;
    setDetailLoading(true);
    client
      .op(selected, unit)
      .then((d) => alive && setDetail({ ...d, id: selected, cmp }))
      .catch(() => alive && setDetail(null))
      .finally(() => alive && setDetailLoading(false));
    return () => {
      alive = false;
    };
  }, [selected, cmp, client, unit]);
  const detail = detailState && detailState.id === selected && detailState.cmp === cmp ? detailState : null;

  // ---------- prévia do resultado ----------
  const renderSeq = useRef(0);
  useEffect(() => {
    if (tab !== 'result' || !cmp) return;
    const seq = ++renderSeq.current;
    setResultBusy(true);
    const t = window.setTimeout(async () => {
      try {
        const r = await client.render({
          decisions: { status: dec.current.status, edits: [...dec.current.edits] },
          unit,
        });
        if (seq !== renderSeq.current) return;
        setResult({ lines: r.text.split('\n'), marks: r.marks, lineOps: r.lineOps, opLine: r.opLine, lineNo: buildLineNumbers(r.marks) });
      } finally {
        if (seq === renderSeq.current) setResultBusy(false);
      }
    }, 200);
    return () => window.clearTimeout(t);
  }, [tab, cmp, ver, client, unit]);

  // acompanha a seleção na prévia
  useEffect(() => {
    if (tab === 'result' && result && selected !== null) {
      const line = result.opLine[selected];
      if (line >= 0) setResultScroll({ index: line, nonce: Date.now() });
    }
  }, [tab, result, selected]);

  // ---------- atalhos de teclado ----------
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e: KeyboardEvent) => {
    if (!cmp || view !== 'review' || saveOpen || paste) return;
    const el = e.target as HTMLElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'a') decide(ST_ACCEPT);
    else if (k === 'r') decide(ST_REJECT);
    else if (k === 'u') decide(ST_PENDING);
    else if (k === 'e') {
      setTab('review');
      setEditReq((n) => n + 1);
    } else if (k === 'j' || k === 'arrowdown') nav(1);
    else if (k === 'k' || k === 'arrowup') nav(-1);
    else if (k === 'n') nextPending(selected);
    else return;
    e.preventDefault();
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // ---------- salvar ----------
  const doSave = async (o: SaveOptions) => {
    setSaving(true);
    setSaveError(null);
    try {
      const text = await client.export({
        decisions: { status: dec.current.status, edits: [...dec.current.edits] },
        indent: o.indent,
        eol: o.eol,
        finalNewline: o.finalNewline,
      });
      const name = /\.json$/i.test(o.name) ? o.name : o.name + '.json';
      const w = window as unknown as {
        showSaveFilePicker?: (opts: unknown) => Promise<{ createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }> }>;
      };
      const blob = new Blob([text], { type: 'application/json' });
      if (w.showSaveFilePicker) {
        try {
          const h = await w.showSaveFilePicker({ suggestedName: name, types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }] });
          const ws = await h.createWritable();
          await ws.write(blob);
          await ws.close();
        } catch (e) {
          if ((e as Error).name === 'AbortError') return;
          throw e;
        }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
      setSaveOpen(false);
      flash(`Arquivo "${name}" salvo.`);
    } catch (e) {
      setSaveError('Não foi possível salvar: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const defaultSaveName = (docs[dst]?.name ?? 'resultado.json').replace(/(\.json)?$/i, '-mesclado.json');

  // =====================================================================
  const total = cmp?.ops.length ?? 0;
  const decided = total - counts[ST_PENDING];
  const selOp = selected !== null && cmp ? cmp.ops[selected] : null;
  const selPos = selected !== null ? lowerBound(ids, selected) : 0;

  const fileChip = (side: Side) => (
    <div className={`chip ${side === dst ? 'chip-dst' : 'chip-src'}`} title={docs[side]?.name}>
      <span className={`side-badge side-${side}`}>{side}</span>
      <span className="chip-name">{docs[side]?.name}</span>
      <span className="chip-role">{side === dst ? 'destino' : 'origem'}</span>
    </div>
  );

  const directionControl = (
    <div className="direction" title="Direção: de qual arquivo vêm as mudanças e qual será modificado">
      {view === 'setup' && <span className="muted small">Levar mudanças de</span>}
      <div className="seg">
        <button className={direction === 'BtoA' ? 'on' : ''} onClick={() => changeDirection('BtoA')} disabled={comparing}>
          B → A
        </button>
        <button className={direction === 'AtoB' ? 'on' : ''} onClick={() => changeDirection('AtoB')} disabled={comparing}>
          A → B
        </button>
      </div>
    </div>
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand" onClick={() => setView('setup')} title={view === 'review' ? 'Voltar aos arquivos' : undefined}>
          <span className="logo">{'{ }'}</span> JSONDiff
        </div>
        {view === 'review' && cmp && (
          <>
            <div className="chips">
              {fileChip(src)}
              <span className="flow">→</span>
              {fileChip(dst)}
            </div>
            {directionControl}
            <div className="progress" title={`${decided} de ${total} decididas`}>
              <div className="bar">
                <div style={{ width: total ? `${(decided / total) * 100}%` : '0%' }} />
              </div>
              <span className="small">
                {fmtNum(decided)}/{fmtNum(total)} decididas
              </span>
            </div>
            <div className="top-actions">
              <button className="btn ghost" onClick={() => setView('setup')}>
                Arquivos
              </button>
              <button className="btn primary" onClick={() => setSaveOpen(true)} disabled={!total}>
                Salvar resultado…
              </button>
            </div>
          </>
        )}
      </header>

      {view === 'setup' || !cmp ? (
        <main className="setup">
          <div className="intro">
            <h1>Compare e mescle dois arquivos JSON</h1>
            <p className="muted">
              Carregue o original e a versão modificada. As diferenças são listadas campo a campo; você aceita, rejeita ou ajusta cada uma e salva
              o arquivo final. Tudo roda no seu navegador — nenhum dado é enviado para servidores.
            </p>
          </div>
          <div className="slots">
            <FileSlot side="A" role={dst === 'A' ? 'destino' : 'origem'} info={docs.A} loading={loading.A} error={errors.A} onFiles={onFiles} onPaste={setPaste} />
            <FileSlot side="B" role={dst === 'B' ? 'destino' : 'origem'} info={docs.B} loading={loading.B} error={errors.B} onFiles={onFiles} onPaste={setPaste} />
          </div>
          <div className="setup-actions">
            {directionControl}
            <div className="muted small dir-explain">
              As mudanças de <b>{src}</b> serão aplicadas sobre <b>{dst}</b>. O arquivo salvo será uma versão de {dst}.
            </div>
            <button
              className="btn primary big"
              disabled={!docs.A || !docs.B || comparing}
              onClick={() => (cmp ? setView('review') : runCompare(direction, strategies, false))}
            >
              {comparing ? (
                <>
                  <span className="spinner" /> Comparando…
                </>
              ) : cmp ? (
                'Continuar revisão'
              ) : (
                'Comparar'
              )}
            </button>
            {cmpError && <div className="err-title">{cmpError}</div>}
            <button
              className="btn link"
              onClick={() => {
                loadText('A', SAMPLE_A, 'exemplo-original.json');
                loadText('B', SAMPLE_B, 'exemplo-modificado.json');
              }}
            >
              Carregar arquivos de exemplo
            </button>
          </div>
        </main>
      ) : (
        <main className="workspace">
          <aside className="left">
            <div className="filters">
              <div className="kind-toggles">
                {(['chg', 'add', 'del'] as Kind[]).map((k) => (
                  <button key={k} className={`toggle kind-${k} ${kinds[k] ? 'on' : ''}`} onClick={() => setKinds({ ...kinds, [k]: !kinds[k] })}>
                    {KIND_LABEL[k]} <b>{fmtNum(kindCounts[k])}</b>
                  </button>
                ))}
              </div>
              <div className="filter-row">
                <input className="search" placeholder="Filtrar por caminho ou valor…" value={q} onChange={(e) => setQ(e.target.value)} />
                <select value={String(stFilter)} onChange={(e) => setStFilter(e.target.value === 'all' ? 'all' : (Number(e.target.value) as Status))}>
                  <option value="all">Todas ({fmtNum(total)})</option>
                  <option value={ST_PENDING}>Pendentes ({fmtNum(counts[ST_PENDING])})</option>
                  <option value={ST_ACCEPT}>Aceitas ({fmtNum(counts[ST_ACCEPT])})</option>
                  <option value={ST_REJECT}>Rejeitadas ({fmtNum(counts[ST_REJECT])})</option>
                  <option value={ST_EDIT}>Editadas ({fmtNum(counts[ST_EDIT])})</option>
                </select>
              </div>
              <div className="bulk">
                <span className="muted small">{fmtNum(ids.length)} na lista:</span>
                <button className="btn tiny accept" onClick={() => bulk(ST_ACCEPT)} disabled={!ids.length}>
                  Aceitar todas
                </button>
                <button className="btn tiny reject" onClick={() => bulk(ST_REJECT)} disabled={!ids.length}>
                  Rejeitar todas
                </button>
                <button className="btn tiny ghost" onClick={() => bulk(ST_PENDING)} disabled={!ids.length}>
                  Desfazer
                </button>
              </div>
            </div>
            <DiffList ops={cmp.ops} ids={ids} status={dec.current.status} selected={selected} onSelect={(id) => select(id, { scrollList: false })} scrollTo={listScroll} />
            <div className="list-foot muted small">
              Comparado em {fmtNum(cmp.ms)} ms · atalhos: A aceitar · R rejeitar · E editar · J/K navegar · N próxima pendente
            </div>
          </aside>

          <section className="right">
            <nav className="tabs">
              <button className={tab === 'review' ? 'on' : ''} onClick={() => setTab('review')}>
                Revisão
              </button>
              <button className={tab === 'result' ? 'on' : ''} onClick={() => setTab('result')}>
                Resultado ({dst})
              </button>
              <button className={tab === 'arrays' ? 'on' : ''} onClick={() => setTab('arrays')}>
                Listas / identificadores ({cmp.arrays.length})
              </button>
            </nav>
            <div className="tab-body">
              {tab === 'review' &&
                (total === 0 ? (
                  <div className="review empty-state">
                    <div className="big-check">=</div>
                    <div>Os arquivos são equivalentes: nenhuma diferença de chaves ou valores.</div>
                    <div className="muted small">A ordem das chaves e dos itens pareados por identificador não é considerada diferença.</div>
                  </div>
                ) : (
                  <ReviewPanel
                    op={selOp}
                    detail={detail}
                    detailLoading={detailLoading}
                    status={(selected !== null ? dec.current.status[selected] : 0) as Status}
                    editedText={selected !== null ? dec.current.edits.get(selected) : undefined}
                    dst={dst}
                    src={src}
                    position={{ index: ids[selPos] === selected ? selPos : -1, total: ids.length }}
                    pendingCount={counts[ST_PENDING]}
                    autoAdvance={autoAdvance}
                    onAutoAdvance={setAutoAdvance}
                    onDecide={decide}
                    onNav={nav}
                    onNextPending={() => nextPending(selected)}
                    onShowInResult={() => setTab('result')}
                    editRequest={editReq}
                  />
                ))}
              {tab === 'result' && (
                <ResultView
                  data={result}
                  busy={resultBusy}
                  selected={selected}
                  dst={dst}
                  scrollTo={resultScroll}
                  onSelectOp={(id) => {
                    select(id);
                    setTab('review');
                  }}
                />
              )}
              {tab === 'arrays' && (
                <ArraysPanel
                  key={JSON.stringify(strategies)}
                  arrays={cmp.arrays}
                  strategies={strategies}
                  busy={comparing}
                  onApply={(s) => runCompare(direction, s, true)}
                />
              )}
            </div>
          </section>
        </main>
      )}

      {paste && (
        <PasteDialog
          side={paste}
          onClose={() => setPaste(null)}
          onSubmit={(text, name) => {
            const side = paste;
            if (!confirmDiscard()) return;
            setPaste(null);
            loadText(side, text, name);
          }}
        />
      )}
      {saveOpen && docs[dst] && (
        <SaveDialog
          dst={dst}
          defaultName={defaultSaveName}
          format={docs[dst]!.format}
          counts={counts}
          saving={saving}
          error={saveError}
          onClose={() => setSaveOpen(false)}
          onSave={doSave}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
