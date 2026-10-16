import type { ArrayInfo, ArrayStrategy, DocStats, FormatInfo, OpSummary } from '../core/types';
import type { StructChild } from '../core/pattern';
import type { ParseError } from '../core/util';

export type Side = 'A' | 'B';
export type ExcludeMode = 'keep' | 'remove';

export interface StructureResult {
  children: StructChild[];
  sampled: boolean;
}
/** 'BtoA' = levar as mudanças de B para A (A é o destino). */
export type Direction = 'AtoB' | 'BtoA';

export interface DocInfo {
  name: string;
  size: number;
  format: FormatInfo;
  stats: DocStats;
  warnings: string[];
  rootType: string;
}

export interface CompareResult {
  ops: OpSummary[];
  arrays: ArrayInfo[];
  ms: number;
}

export interface OpDetail {
  fromText?: string;
  toText?: string;
  truncated: boolean;
}

export interface RenderResult {
  text: string;
  lineCount: number;
  marks: Uint8Array;
  lineOps: Int32Array;
  opLine: Int32Array;
}

/** Decisões serializáveis: status por operação + edições em texto JSON. */
export interface WireDecisions {
  status: Uint8Array;
  edits: [number, string][];
}

export type Request =
  | { type: 'load'; side: Side; text: string; name: string }
  | {
      type: 'compare';
      direction: Direction;
      strategies: Record<string, ArrayStrategy>;
      exclude: string[];
      excludeMode: ExcludeMode;
    }
  | { type: 'structure'; pattern: string }
  | { type: 'op'; id: number; unit: string }
  | { type: 'render'; decisions: WireDecisions; unit: string }
  | { type: 'export'; decisions: WireDecisions; indent: string; eol: '\n' | '\r\n'; finalNewline: boolean };

export type Response =
  | { ok: true; data: unknown }
  | { ok: false; error: string; parse?: ParseError };
