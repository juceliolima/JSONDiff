import { useEffect, useMemo, useRef, useState } from 'react';
import { ST_ACCEPT, ST_EDIT, ST_PENDING, ST_REJECT, type OpSummary, type Status } from '../core/types';
import type { OpDetail } from '../worker/protocol';
import { KIND_LABEL, STATUS_LABEL } from './DiffList';
import { lineDiff } from './lineDiff';

interface Props {
  op: OpSummary | null;
  detail: OpDetail | null;
  detailLoading: boolean;
  status: Status;
  editedText?: string;
  dst: string; // ex.: "A"
  src: string;
  position: { index: number; total: number };
  pendingCount: number;
  autoAdvance: boolean;
  onAutoAdvance: (v: boolean) => void;
  onDecide: (st: Status, edited?: string) => void;
  onNav: (delta: number) => void;
  onNextPending: () => void;
  onShowInResult: () => void;
  onExclude?: () => void;
  editRequest: number; // muda quando o atalho "E" é usado
}

export function ReviewPanel(p: Props) {
  const { op, detail } = p;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setEditing(false);
    setErr(null);
  }, [op?.id]);

  const startEdit = () => {
    if (!op || !detail || detail.truncated) return;
    setText(p.editedText ?? detail.toText ?? detail.fromText ?? '');
    setErr(null);
    setEditing(true);
    setTimeout(() => area.current?.focus(), 0);
  };

  // atalho "E": abre a edição assim que os valores da diferença estiverem carregados
  const [wantEdit, setWantEdit] = useState(false);
  useEffect(() => {
    if (p.editRequest) setWantEdit(true);
  }, [p.editRequest]);
  useEffect(() => {
    if (wantEdit && detail && !p.detailLoading) {
      setWantEdit(false);
      startEdit();
    }
  }, [wantEdit, detail, p.detailLoading]);

  const diffLines = useMemo(() => {
    if (!detail) return null;
    const a = detail.fromText?.split('\n') ?? [];
    const b = detail.toText?.split('\n') ?? [];
    if (a.length && b.length && a.length + b.length < 40000) return { a, b, ...lineDiff(a, b) };
    return { a, b, aChanged: a.map(() => true), bChanged: b.map(() => true) };
  }, [detail]);

  if (!op) {
    return (
      <div className="review empty-state">
        <div className="big-check">✓</div>
        <div>Selecione uma diferença na lista para revisar.</div>
      </div>
    );
  }

  const explain =
    op.kind === 'add'
      ? `Existe só em ${p.src}. Aceitar insere este valor em ${p.dst}.`
      : op.kind === 'del'
        ? `Existe só em ${p.dst}. Aceitar remove este valor de ${p.dst}.`
        : `Valor diferente nos dois arquivos. Aceitar substitui o valor de ${p.dst} pelo de ${p.src}.`;

  const applyEdit = () => {
    try {
      JSON.parse(text);
    } catch (e) {
      setErr('JSON inválido: ' + (e as Error).message);
      return;
    }
    setEditing(false);
    p.onDecide(ST_EDIT, text);
  };

  return (
    <div className="review">
      <div className="review-head">
        <div className="review-title">
          <span className={`kind-pill kind-${op.kind}`}>{KIND_LABEL[op.kind]}</span>
          <span className={`status-pill st-${['pending', 'accept', 'reject', 'edit'][p.status]}`}>{STATUS_LABEL[p.status]}</span>
          <span className="muted small">
            {p.position.index + 1} de {p.position.total} · {p.pendingCount} pendente(s)
          </span>
        </div>
        <code className="review-path">{op.path}</code>
        <div className="muted">{explain}</div>
      </div>

      <div className="review-body">
        {p.detailLoading && !detail ? (
          <div className="muted">
            <span className="spinner" /> Carregando valores…
          </div>
        ) : editing ? (
          <div className="editor">
            <div className="editor-label">
              Valor que será gravado em <b>{p.dst}</b> (JSON válido — texto entre aspas, números, objetos…)
            </div>
            <textarea
              ref={area}
              value={text}
              spellCheck={false}
              onChange={(e) => {
                setText(e.target.value);
                setErr(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) applyEdit();
                if (e.key === 'Escape') setEditing(false);
              }}
            />
            {err && <div className="err-title">{err}</div>}
            <div className="row-actions">
              <button className="btn primary" onClick={applyEdit}>
                Aplicar edição <kbd>Ctrl+Enter</kbd>
              </button>
              <button className="btn ghost" onClick={() => setEditing(false)}>
                Cancelar <kbd>Esc</kbd>
              </button>
            </div>
          </div>
        ) : (
          diffLines && (
            <div className={`compare ${op.kind}`}>
              <ValueCol
                title={`${p.dst} — atual`}
                lines={diffLines.a}
                changed={diffLines.aChanged}
                cls="from"
                emptyMsg={`(não existe em ${p.dst})`}
              />
              <ValueCol
                title={`${p.src} — proposto`}
                lines={diffLines.b}
                changed={diffLines.bChanged}
                cls="to"
                emptyMsg={`(não existe em ${p.src} — será removido)`}
              />
            </div>
          )
        )}
        {detail?.truncated && <div className="warn">Valor muito grande: exibição truncada e edição desativada. Veja-o completo na aba Resultado.</div>}
        {p.status === ST_EDIT && p.editedText !== undefined && !editing && (
          <div className="edited-box">
            <div className="editor-label">Seu valor editado:</div>
            <pre>{p.editedText}</pre>
          </div>
        )}
      </div>

      <div className="review-actions">
        <div className="decide">
          <button className="btn accept" onClick={() => p.onDecide(ST_ACCEPT)} disabled={editing}>
            ✓ Aceitar <kbd>A</kbd>
          </button>
          <button className="btn reject" onClick={() => p.onDecide(ST_REJECT)} disabled={editing}>
            ✕ Rejeitar <kbd>R</kbd>
          </button>
          <button className="btn edit" onClick={startEdit} disabled={editing || !detail || detail.truncated}>
            ✎ Editar <kbd>E</kbd>
          </button>
          {p.status !== ST_PENDING && (
            <button className="btn ghost" onClick={() => p.onDecide(ST_PENDING)} disabled={editing}>
              Desfazer <kbd>U</kbd>
            </button>
          )}
        </div>
        <div className="nav">
          <button className="btn ghost" onClick={() => p.onNav(-1)} title="Anterior (K ou ↑)">
            ↑ Anterior
          </button>
          <button className="btn ghost" onClick={() => p.onNav(1)} title="Próxima (J ou ↓)">
            ↓ Próxima
          </button>
          <button className="btn ghost" onClick={p.onNextPending} title="Próxima pendente (N)">
            Próxima pendente <kbd>N</kbd>
          </button>
          <button className="btn ghost" onClick={p.onShowInResult}>
            Ver no resultado
          </button>
          {p.onExclude && (
            <button className="btn ghost" onClick={p.onExclude} title={`Ignorar ${op.pattern} em toda a comparação`}>
              Excluir da comparação
            </button>
          )}
          <label className="check">
            <input type="checkbox" checked={p.autoAdvance} onChange={(e) => p.onAutoAdvance(e.target.checked)} /> avançar após decidir
          </label>
        </div>
      </div>
    </div>
  );
}

function ValueCol(props: { title: string; lines: string[]; changed: boolean[]; cls: string; emptyMsg: string }) {
  return (
    <div className={`vcol ${props.cls}`}>
      <div className="vcol-title">{props.title}</div>
      {props.lines.length ? (
        <pre className="code">
          {props.lines.map((l, i) => (
            <div key={i} className={props.changed[i] ? `ln hl-${props.cls}` : 'ln'}>
              <span className="lno">{i + 1}</span>
              {l || ' '}
            </div>
          ))}
        </pre>
      ) : (
        <div className="absent muted">{props.emptyMsg}</div>
      )}
    </div>
  );
}
