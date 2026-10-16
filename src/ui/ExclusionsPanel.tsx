import { useEffect, useState } from 'react';
import { normalizePattern, type StructChild } from '../core/pattern';
import type { DiffClient } from '../worker/client';
import type { ExcludeMode, StructureResult } from '../worker/protocol';
import { fmtNum } from './format';

interface Props {
  client: DiffClient;
  /** Muda quando os arquivos carregados mudam (recarrega a árvore). */
  docsKey: string;
  exclusions: string[];
  mode: ExcludeMode;
  onApply: (exclusions: string[], mode: ExcludeMode) => void;
  /** true = aplica cada mudança na hora; false = rascunho + botão "Aplicar". */
  live: boolean;
  busy?: boolean;
}

const MAX_CHILDREN = 500;

export function ExclusionsPanel({ client, docsKey, exclusions, mode, onApply, live, busy }: Props) {
  const [draft, setDraft] = useState(exclusions);
  const [draftMode, setDraftMode] = useState(mode);
  const [nodes, setNodes] = useState<Record<string, StructureResult | 'loading'>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [manual, setManual] = useState('');
  const [manualErr, setManualErr] = useState<string | null>(null);

  useEffect(() => setDraft(exclusions), [exclusions]);
  useEffect(() => setDraftMode(mode), [mode]);

  const load = (pattern: string) => {
    setNodes((n) => ({ ...n, [pattern]: 'loading' }));
    client
      .structure(pattern)
      .then((r) => setNodes((n) => ({ ...n, [pattern]: r })))
      .catch(() => setNodes((n) => ({ ...n, [pattern]: { children: [], sampled: false } })));
  };

  useEffect(() => {
    setNodes({});
    setOpen(new Set());
    load('$');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docsKey]);

  const set = new Set(draft);
  const update = (next: string[], m = draftMode) => {
    setDraft(next);
    setDraftMode(m);
    if (live) onApply(next, m);
  };
  const toggleExcl = (p: string) => update(set.has(p) ? draft.filter((x) => x !== p) : [...draft, p]);
  const toggleOpen = (p: string) => {
    const next = new Set(open);
    if (next.has(p)) next.delete(p);
    else {
      next.add(p);
      if (!nodes[p]) load(p);
    }
    setOpen(next);
  };

  const addManual = () => {
    const p = normalizePattern(manual);
    if (!p || p === '$') {
      setManualErr('Caminho inválido. Exemplos: config.cache · $.clientes[*].endereco · $["chave com espaço"]');
      return;
    }
    setManualErr(null);
    setManual('');
    if (!set.has(p)) update([...draft, p]);
  };

  const dirty = !live && (JSON.stringify(draft) !== JSON.stringify(exclusions) || draftMode !== mode);

  const renderLevel = (pattern: string, depth: number) => {
    const n = nodes[pattern];
    if (!n || n === 'loading')
      return (
        <div className="tree-row muted small" style={{ paddingLeft: 8 + depth * 18 }}>
          <span className="spinner" /> lendo estrutura…
        </div>
      );
    if (!n.children.length)
      return (
        <div className="tree-row muted small" style={{ paddingLeft: 8 + depth * 18 }}>
          (sem chaves)
        </div>
      );
    const shown = n.children.slice(0, MAX_CHILDREN);
    return (
      <>
        {shown.map((c) => renderChild(c, depth))}
        {n.children.length > MAX_CHILDREN && (
          <div className="tree-row muted small" style={{ paddingLeft: 8 + depth * 18 }}>
            Mostrando {MAX_CHILDREN} de {fmtNum(n.children.length)} chaves — use o campo abaixo para excluir outras pelo caminho.
          </div>
        )}
        {n.sampled && (
          <div className="tree-row muted small" style={{ paddingLeft: 8 + depth * 18 }}>
            Estrutura obtida de uma amostra dos itens.
          </div>
        )}
      </>
    );
  };

  const renderChild = (c: StructChild, depth: number) => {
    const ex = set.has(c.pattern);
    const isOpen = open.has(c.pattern) && !ex;
    const [ca, cb] = c.counts;
    const presence = ca && cb ? '' : ca ? 'só em A' : 'só em B';
    return (
      <div key={c.pattern}>
        <div className={`tree-row ${ex ? 'excluded' : ''}`} style={{ paddingLeft: 8 + depth * 18 }}>
          <button
            className="twisty"
            disabled={!c.expandable || ex}
            onClick={() => toggleOpen(c.pattern)}
            aria-label={isOpen ? 'Recolher' : 'Expandir'}
          >
            {c.expandable && !ex ? (isOpen ? '▾' : '▸') : ''}
          </button>
          {c.isItems ? (
            <span className="tree-items">itens da lista</span>
          ) : (
            <label className="tree-label" title={c.pattern}>
              <input type="checkbox" checked={!ex} onChange={() => toggleExcl(c.pattern)} />
              <span className="tree-key">{c.key}</span>
            </label>
          )}
          <span className="tree-types">{c.types.join(' | ')}</span>
          {presence && <span className={`tree-presence ${ca ? 'only-a' : 'only-b'}`}>{presence}</span>}
          {depth > 0 && (ca > 1 || cb > 1) && (
            <span className="tree-count muted small">
              A {fmtNum(ca)} · B {fmtNum(cb)}
            </span>
          )}
          {ex && <span className="tree-ex">fora da comparação</span>}
        </div>
        {isOpen && renderLevel(c.pattern, depth + 1)}
      </div>
    );
  };

  return (
    <div className="exclusions">
      <p className="muted small excl-intro">
        Desmarque as partes que não devem ser comparadas. Em listas, abra <b>itens da lista</b> para excluir um campo de todos os itens (ex.:{' '}
        <code>$.clientes[*].endereco</code>).
      </p>
      <div className="tree">{renderLevel('$', 0)}</div>

      <div className="excl-manual">
        <input
          value={manual}
          placeholder="ou digite um caminho: config.cache, clientes[*].endereco…"
          onChange={(e) => {
            setManual(e.target.value);
            setManualErr(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && addManual()}
        />
        <button className="btn" onClick={addManual} disabled={!manual.trim()}>
          Excluir caminho
        </button>
      </div>
      {manualErr && <div className="err-title small">{manualErr}</div>}

      {draft.length > 0 && (
        <div className="excl-list">
          <div className="small muted">Fora da comparação ({draft.length}):</div>
          {draft.map((p) => (
            <span key={p} className="excl-chip">
              <code>{p}</code>
              <button onClick={() => toggleExcl(p)} aria-label={`Incluir ${p} novamente`} title="Voltar a comparar">
                ✕
              </button>
            </span>
          ))}
          {draft.length > 1 && (
            <button className="btn link small" onClick={() => update([])}>
              limpar todas
            </button>
          )}
        </div>
      )}

      <div className="excl-mode">
        <span className="small">No arquivo final, as partes excluídas devem:</span>
        <label className="check">
          <input type="radio" checked={draftMode === 'keep'} onChange={() => update(draft, 'keep')} /> ficar como estão no destino
        </label>
        <label className="check">
          <input type="radio" checked={draftMode === 'remove'} onChange={() => update(draft, 'remove')} /> ser removidas
        </label>
      </div>

      {!live && (
        <div className="row-actions">
          <button className="btn primary" disabled={!dirty || busy} onClick={() => onApply(draft, draftMode)}>
            {busy ? 'Recomparando…' : 'Aplicar e recomparar'}
          </button>
          {dirty && (
            <button
              className="btn ghost"
              onClick={() => {
                setDraft(exclusions);
                setDraftMode(mode);
              }}
            >
              Descartar alterações
            </button>
          )}
          <span className="muted small">As decisões já tomadas são mantidas.</span>
        </div>
      )}
    </div>
  );
}
