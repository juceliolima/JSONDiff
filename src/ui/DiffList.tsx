import type { OpSummary } from '../core/types';
import { VirtualList } from './VirtualList';

export const KIND_LABEL = { add: 'Adicionado', del: 'Removido', chg: 'Alterado' } as const;
const KIND_SIGN = { add: '+', del: '−', chg: '~' } as const;
export const STATUS_LABEL = ['Pendente', 'Aceito', 'Rejeitado', 'Editado'] as const;
const STATUS_ICON = ['○', '✓', '✕', '✎'];
const STATUS_CLASS = ['pending', 'accept', 'reject', 'edit'];

interface Props {
  ops: OpSummary[];
  ids: number[];
  status: Uint8Array;
  selected: number | null;
  onSelect: (id: number) => void;
  scrollTo: { index: number; nonce: number } | null;
}

/** Divide o caminho para destacar o último segmento. */
function splitPath(p: string): [string, string] {
  const m = /(\.[^.[\]]+|\[[^\]]*\])$/.exec(p);
  if (!m) return ['', p];
  return [p.slice(0, m.index), m[0]];
}

export function DiffList({ ops, ids, status, selected, onSelect, scrollTo }: Props) {
  if (!ids.length) return <div className="list-empty muted">Nenhuma diferença com os filtros atuais.</div>;
  return (
    <VirtualList
      className="difflist"
      count={ids.length}
      rowHeight={44}
      scrollTo={scrollTo}
      renderRow={(i, style) => {
        const op = ops[ids[i]];
        const st = status[op.id];
        const [head, tail] = splitPath(op.path);
        return (
          <div
            key={op.id}
            style={style}
            className={`row kind-${op.kind} st-${STATUS_CLASS[st]} ${selected === op.id ? 'sel' : ''}`}
            onClick={() => onSelect(op.id)}
            title={op.path}
          >
            <span className={`st-icon st-${STATUS_CLASS[st]}`} title={STATUS_LABEL[st]}>
              {STATUS_ICON[st]}
            </span>
            <span className={`kind-badge kind-${op.kind}`} title={KIND_LABEL[op.kind]}>
              {KIND_SIGN[op.kind]}
            </span>
            <div className="row-main">
              <div className="row-path">
                <span className="path-head">{head}</span>
                <span className="path-tail">{tail}</span>
              </div>
              <div className="row-preview">
                {op.kind === 'chg' ? (
                  <>
                    <span className="pv-from">{op.from}</span>
                    <span className="arrow">→</span>
                    <span className="pv-to">{op.to}</span>
                  </>
                ) : op.kind === 'add' ? (
                  <span className="pv-to">{op.to}</span>
                ) : (
                  <span className="pv-from">{op.from}</span>
                )}
              </div>
            </div>
          </div>
        );
      }}
    />
  );
}
