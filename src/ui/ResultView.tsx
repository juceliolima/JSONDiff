import { M, isGhost } from '../core/render';
import { VirtualList } from './VirtualList';

export interface ResultData {
  lines: string[];
  marks: Uint8Array;
  lineOps: Int32Array;
  opLine: Int32Array;
  lineNo: Int32Array; // número da linha no arquivo final (-1 = linha fantasma)
}

const MARK_CLASS: Record<number, string> = {
  [M.NORMAL]: '',
  [M.ADDED]: 'm-added',
  [M.GHOST_REMOVED]: 'm-ghost-removed',
  [M.CHANGED]: 'm-changed',
  [M.EDITED]: 'm-edited',
  [M.PENDING]: 'm-pending',
  [M.GHOST_PENDING_ADD]: 'm-ghost-pending',
  [M.GHOST_OLD]: 'm-ghost-old',
  [M.REJECTED]: 'm-rejected',
};

export function buildLineNumbers(marks: Uint8Array): Int32Array {
  const out = new Int32Array(marks.length);
  let n = 0;
  for (let i = 0; i < marks.length; i++) out[i] = isGhost(marks[i]) ? -1 : ++n;
  return out;
}

interface Props {
  data: ResultData | null;
  busy: boolean;
  selected: number | null;
  onSelectOp: (id: number) => void;
  scrollTo: { index: number; nonce: number } | null;
  dst: string;
}

export function ResultView({ data, busy, selected, onSelectOp, scrollTo, dst }: Props) {
  return (
    <div className="result">
      <div className="legend">
        <span className="lg m-added">inserido</span>
        <span className="lg m-changed">alterado</span>
        <span className="lg m-edited">editado</span>
        <span className="lg m-ghost-removed">removido</span>
        <span className="lg m-ghost-old">valor antigo</span>
        <span className="lg m-pending">pendente (mantido)</span>
        <span className="lg m-ghost-pending">inserção pendente</span>
        <span className="muted small legend-note">
          Prévia de {dst} após a mesclagem. Linhas riscadas não vão para o arquivo.
          {busy && (
            <>
              {' '}
              <span className="spinner" /> atualizando…
            </>
          )}
        </span>
      </div>
      {!data ? (
        <div className="muted pad">
          <span className="spinner" /> Gerando prévia…
        </div>
      ) : (
        <VirtualList
          className="resultlist"
          count={data.lines.length}
          rowHeight={20}
          scrollTo={scrollTo}
          overscan={20}
          renderRow={(i, style) => {
            const op = data.lineOps[i];
            const no = data.lineNo[i];
            return (
              <div
                key={i}
                style={style}
                className={`rline ${MARK_CLASS[data.marks[i]]} ${op >= 0 && op === selected ? 'sel' : ''} ${op >= 0 ? 'clickable' : ''}`}
                onClick={op >= 0 ? () => onSelectOp(op) : undefined}
              >
                <span className="lno">{no >= 0 ? no : ''}</span>
                <span className="rtext">{data.lines[i] || ' '}</span>
              </div>
            );
          }}
        />
      )}
    </div>
  );
}
