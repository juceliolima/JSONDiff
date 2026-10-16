export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export type JsonObject = { [k: string]: Json };

/** Tipo de diferença, sempre do ponto de vista do DESTINO (arquivo que será modificado). */
export type Kind =
  | 'add' // existe só na origem → será inserido no destino
  | 'del' // existe só no destino → será removido do destino
  | 'chg'; // existe nos dois com valores diferentes → será substituído

/** Árvore de diferenças. Subárvores iguais são colapsadas em `eq`. */
export type DNode =
  | { k: 'eq'; v: Json }
  | { k: 'obj'; entries: { key: string; node: DNode }[] }
  | { k: 'arr'; items: DNode[] }
  | { k: 'add'; op: number; v: Json }
  | { k: 'del'; op: number; v: Json }
  | { k: 'chg'; op: number; from: Json; to: Json };

export interface OpSummary {
  id: number;
  kind: Kind;
  /** Caminho legível, ex.: $.usuarios[id=42].nome */
  path: string;
  /** Caminho genérico do array/objeto pai, ex.: $.usuarios[*] */
  pattern: string;
  depth: number;
  from?: string; // prévia curta do valor no destino
  to?: string; // prévia curta do valor na origem
  fromType?: string;
  toType?: string;
}

/** Como os elementos de um array são pareados entre os dois arquivos. */
export type ArrayStrategy =
  | { mode: 'auto' }
  | { mode: 'key'; key: string }
  | { mode: 'content' }
  | { mode: 'index' };

export interface ArrayInfo {
  pattern: string;
  occurrences: number;
  /** Campos presentes em todos os objetos do array (valor string/número). */
  candidates: string[];
  /** Candidatos com valor único em cada array (bons identificadores). */
  uniqueCandidates: string[];
  mode: 'key' | 'content' | 'index';
  key?: string;
  auto: boolean;
  mixed?: boolean;
}

export const ST_PENDING = 0;
export const ST_ACCEPT = 1;
export const ST_REJECT = 2;
export const ST_EDIT = 3;
export type Status = 0 | 1 | 2 | 3;

export interface Decisions {
  status: Uint8Array; // indexado pelo id da operação
  edits: Map<number, Json>; // valores editados (status ST_EDIT)
}

export interface DocStats {
  objects: number;
  arrays: number;
  keys: number;
  maxDepth: number;
}

export interface FormatInfo {
  indent: string; // '' = minificado
  eol: '\n' | '\r\n';
  finalNewline: boolean;
}
