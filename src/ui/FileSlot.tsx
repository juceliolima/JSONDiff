import { useRef, useState } from 'react';
import type { ParseError } from '../core/util';
import type { DocInfo, Side } from '../worker/protocol';
import { fmtBytes, fmtNum } from './format';

interface Props {
  side: Side;
  role: 'destino' | 'origem';
  info?: DocInfo;
  loading?: boolean;
  error?: { message: string; parse?: ParseError };
  onFiles: (side: Side, files: File[]) => void;
  onPaste: (side: Side) => void;
}

export function FileSlot({ side, role, info, loading, error, onFiles, onPaste }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      className={`slot ${over ? 'over' : ''} ${info ? 'filled' : ''} ${error ? 'has-error' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const files = [...e.dataTransfer.files];
        if (files.length) onFiles(side, files);
      }}
    >
      <div className="slot-head">
        <span className={`side-badge side-${side}`}>{side}</span>
        <span className={`role role-${role}`}>{role === 'destino' ? 'Destino — será modificado' : 'Origem — fornece as mudanças'}</span>
      </div>

      {loading ? (
        <div className="slot-body muted">
          <span className="spinner" /> Lendo e validando…
        </div>
      ) : info ? (
        <div className="slot-body">
          <div className="file-name" title={info.name}>
            {info.name}
          </div>
          <div className="file-meta">
            {fmtBytes(info.size)} · {info.rootType} · {fmtNum(info.stats.objects)} objetos · {fmtNum(info.stats.arrays)} arrays ·{' '}
            {fmtNum(info.stats.keys)} chaves · indentação {indentLabel(info.format.indent)}
          </div>
          {info.warnings.map((w) => (
            <div key={w} className="warn">
              ⚠ {w}
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="slot-body">
          <div className="err-title">✕ {error.message}</div>
          {error.parse && (
            <div className="err-detail">
              {error.parse.line !== undefined && (
                <div>
                  Linha {error.parse.line}, coluna {error.parse.column}
                </div>
              )}
              {error.parse.context && <pre>{error.parse.context}</pre>}
              <div className="muted small">{error.parse.message}</div>
            </div>
          )}
        </div>
      ) : (
        <div className="slot-body empty">
          <div className="drop-hint">Arraste um arquivo .json aqui</div>
        </div>
      )}

      <div className="slot-actions">
        <button className="btn" onClick={() => input.current?.click()}>
          {info ? 'Trocar arquivo' : 'Abrir arquivo'}
        </button>
        <button className="btn ghost" onClick={() => onPaste(side)}>
          Colar texto
        </button>
      </div>
      <input
        ref={input}
        type="file"
        multiple
        accept=".json,application/json,text/plain"
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) onFiles(side, files);
        }}
      />
    </div>
  );
}

export function indentLabel(indent: string) {
  if (!indent) return 'minificado';
  if (indent === '\t') return 'tab';
  return `${indent.length} espaços`;
}
