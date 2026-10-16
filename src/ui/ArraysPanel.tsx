import { useState } from 'react';
import type { ArrayInfo, ArrayStrategy } from '../core/types';
import { fmtNum } from './format';

interface Props {
  arrays: ArrayInfo[];
  strategies: Record<string, ArrayStrategy>;
  onApply: (s: Record<string, ArrayStrategy>) => void;
  busy: boolean;
}

const encode = (s: ArrayStrategy | undefined) => (!s || s.mode === 'auto' ? 'auto' : s.mode === 'key' ? 'key:' + s.key : s.mode);
const decode = (v: string): ArrayStrategy =>
  v === 'auto' ? { mode: 'auto' } : v.startsWith('key:') ? { mode: 'key', key: v.slice(4) } : { mode: v as 'content' | 'index' };

export function ArraysPanel({ arrays, strategies, onApply, busy }: Props) {
  const [draft, setDraft] = useState<Record<string, ArrayStrategy>>(strategies);
  const dirty = JSON.stringify(draft) !== JSON.stringify(strategies);

  return (
    <div className="arrays">
      <div className="arrays-intro">
        <p>
          Como os elementos de cada lista são pareados entre os dois arquivos. Com um <b>campo identificador</b> (ex.: <code>id</code>), cada
          item é comparado com o item de mesmo id, mesmo que a ordem tenha mudado. <b>Por conteúdo</b> (usado quando não há identificador): itens
          idênticos são casados mantendo a ordem, e os que sobram entre eles são comparados campo a campo. <b>Por posição</b>: compara o 1º com o
          1º, o 2º com o 2º etc.
        </p>
        <p className="muted small">Ao recomparar, as decisões já tomadas são mantidas para as diferenças que continuarem existindo.</p>
      </div>
      <table className="arrays-table">
        <thead>
          <tr>
            <th>Lista</th>
            <th>Ocorrências</th>
            <th>Pareamento</th>
          </tr>
        </thead>
        <tbody>
          {arrays.map((a) => {
            const autoLabel = a.auto ? (a.mode === 'key' ? `Automático (campo "${a.key}")` : 'Automático (por conteúdo)') : 'Automático';
            return (
              <tr key={a.pattern}>
                <td>
                  <code>{a.pattern}</code>
                  {a.mixed && a.auto && <div className="muted small">a detecção variou entre ocorrências</div>}
                </td>
                <td className="num">{fmtNum(a.occurrences)}</td>
                <td>
                  <select
                    value={encode(draft[a.pattern])}
                    onChange={(e) => setDraft({ ...draft, [a.pattern]: decode(e.target.value) })}
                  >
                    <option value="auto">{autoLabel}</option>
                    {a.candidates.map((c) => (
                      <option key={c} value={'key:' + c}>
                        Campo "{c}"{a.uniqueCandidates.includes(c) ? '' : ' (tem valores repetidos)'}
                      </option>
                    ))}
                    {draft[a.pattern]?.mode === 'key' && !a.candidates.includes((draft[a.pattern] as { key: string }).key) && (
                      <option value={encode(draft[a.pattern])}>Campo "{(draft[a.pattern] as { key: string }).key}"</option>
                    )}
                    <option value="content">Por conteúdo (sem identificador)</option>
                    <option value="index">Por posição</option>
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!arrays.length && <div className="muted pad">Nenhuma lista com diferenças.</div>}
      <div className="row-actions">
        <button className="btn primary" disabled={!dirty || busy} onClick={() => onApply(draft)}>
          {busy ? 'Recomparando…' : 'Recomparar com estas opções'}
        </button>
        {dirty && (
          <button className="btn ghost" onClick={() => setDraft(strategies)}>
            Descartar alterações
          </button>
        )}
      </div>
    </div>
  );
}
