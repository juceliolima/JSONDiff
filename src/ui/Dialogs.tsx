import { useState, type ReactNode } from 'react';
import type { FormatInfo } from '../core/types';
import { fmtNum } from './format';

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn ghost icon" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PasteDialog({ side, onClose, onSubmit }: { side: string; onClose: () => void; onSubmit: (text: string, name: string) => void }) {
  const [text, setText] = useState('');
  const [name, setName] = useState(`colado-${side}.json`);
  return (
    <Modal title={`Colar JSON em ${side}`} onClose={onClose}>
      <label className="field">
        Nome
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <textarea className="paste-area" value={text} onChange={(e) => setText(e.target.value)} placeholder='{"chave": "valor"}' autoFocus spellCheck={false} />
      <div className="row-actions end">
        <button className="btn ghost" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn primary" disabled={!text.trim()} onClick={() => onSubmit(text, name || `colado-${side}.json`)}>
          Carregar
        </button>
      </div>
    </Modal>
  );
}

export interface SaveOptions {
  name: string;
  indent: string;
  eol: '\n' | '\r\n';
  finalNewline: boolean;
}

interface SaveProps {
  dst: string;
  defaultName: string;
  format: FormatInfo;
  counts: number[]; // por status
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (o: SaveOptions) => void;
}

export function SaveDialog({ dst, defaultName, format, counts, saving, error, onClose, onSave }: SaveProps) {
  const [name, setName] = useState(defaultName);
  const [indent, setIndent] = useState(format.indent);
  const [eol, setEol] = useState(format.eol);
  const [finalNewline, setFinalNewline] = useState(format.finalNewline);
  const [pending, accepted, rejected, edited] = counts;
  const indentOpts = ['  ', '    ', '\t', ''];
  if (!indentOpts.includes(indent)) indentOpts.unshift(indent);

  return (
    <Modal title="Salvar arquivo final" onClose={onClose}>
      <div className="summary">
        <div className="sum accept">
          <b>{fmtNum(accepted)}</b> aceita(s)
        </div>
        <div className="sum edit">
          <b>{fmtNum(edited)}</b> editada(s)
        </div>
        <div className="sum reject">
          <b>{fmtNum(rejected)}</b> rejeitada(s)
        </div>
        <div className="sum pending">
          <b>{fmtNum(pending)}</b> pendente(s)
        </div>
      </div>
      {pending > 0 && (
        <div className="warn">
          Há {fmtNum(pending)} diferença(s) sem decisão. Elas <b>não</b> serão aplicadas: {dst} fica como está nesses pontos.
        </div>
      )}
      <p className="muted small">O arquivo é gerado no seu navegador e salvo no seu computador — nada é enviado para servidores.</p>
      <label className="field">
        Nome do arquivo
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="field-row">
        <label className="field">
          Indentação
          <select value={indent} onChange={(e) => setIndent(e.target.value)}>
            {indentOpts.map((o) => (
              <option key={o} value={o}>
                {o === '' ? 'Minificado' : o === '\t' ? 'Tab' : `${o.length} espaços`}
                {o === format.indent ? ' (original)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Fim de linha
          <select value={eol} onChange={(e) => setEol(e.target.value as '\n' | '\r\n')}>
            <option value={'\n'}>LF (Linux/macOS){format.eol === '\n' ? ' (original)' : ''}</option>
            <option value={'\r\n'}>CRLF (Windows){format.eol === '\r\n' ? ' (original)' : ''}</option>
          </select>
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={finalNewline} onChange={(e) => setFinalNewline(e.target.checked)} /> Quebra de linha no final do arquivo
      </label>
      {error && <div className="err-title">{error}</div>}
      <div className="row-actions end">
        <button className="btn ghost" onClick={onClose}>
          Voltar à revisão
        </button>
        <button className="btn primary" disabled={saving || !name.trim()} onClick={() => onSave({ name: name.trim(), indent, eol, finalNewline })}>
          {saving ? 'Gerando…' : 'Confirmar e salvar'}
        </button>
      </div>
    </Modal>
  );
}
