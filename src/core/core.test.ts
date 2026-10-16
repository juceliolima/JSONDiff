import { describe, expect, it } from 'vitest';
import { alignByContent, internIds } from './align';
import { diff } from './diff';
import { merge, serialize } from './merge';
import { render, M } from './render';
import { ST_ACCEPT, ST_EDIT, ST_REJECT, type Decisions, type Json } from './types';
import { detectFormat, inspect } from './util';

const decide = (n: number, fill = 0): Decisions => ({ status: new Uint8Array(n).fill(fill), edits: new Map() });

describe('diff de objetos', () => {
  const A = { nome: 'Ana', idade: 30, cidade: 'São Luís', extra: true };
  const B = { nome: 'Ana', idade: 31, uf: 'MA', cidade: 'São Luís' };
  const r = diff(A, B);

  it('classifica adicionado, removido e alterado', () => {
    expect(r.ops.map((o) => [o.kind, o.path])).toEqual([
      ['chg', '$.idade'],
      ['add', '$.uf'],
      ['del', '$.extra'],
    ]);
  });

  it('sem decisões, o resultado é igual ao destino', () => {
    expect(merge(r.root, decide(r.ops.length))).toEqual(A);
  });

  it('aceitando tudo, o resultado é igual à origem e mantém a ordem do destino', () => {
    const out = merge(r.root, decide(r.ops.length, ST_ACCEPT)) as Record<string, Json>;
    expect(out).toEqual(B);
    expect(Object.keys(out)).toEqual(['nome', 'idade', 'uf', 'cidade']);
  });

  it('valor editado substitui a proposta', () => {
    const d = decide(r.ops.length);
    d.status[0] = ST_EDIT;
    d.edits.set(0, 99);
    d.status[2] = ST_REJECT;
    expect(merge(r.root, d)).toEqual({ nome: 'Ana', idade: 99, cidade: 'São Luís', extra: true });
  });

  it('documentos iguais (ordem de chaves diferente) não geram diferenças', () => {
    expect(diff({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }).ops).toHaveLength(0);
  });
});

describe('arrays com campo identificador', () => {
  const A = { itens: [{ id: 1, v: 'a' }, { id: 2, v: 'b' }, { id: 3, v: 'c' }] };
  const B = { itens: [{ id: 3, v: 'c' }, { id: 1, v: 'A' }, { id: 4, v: 'd' }] };
  const r = diff(A, B);

  it('detecta "id" automaticamente e compara campo a campo', () => {
    expect(r.arrays[0]).toMatchObject({ pattern: '$.itens', mode: 'key', key: 'id', auto: true });
    expect(r.ops.map((o) => [o.kind, o.path])).toEqual([
      ['chg', '$.itens[id=1].v'],
      ['add', '$.itens[id=4]'],
      ['del', '$.itens[id=2]'],
    ]);
  });

  it('reordenação não é tratada como diferença', () => {
    expect(diff({ l: [{ id: 1 }, { id: 2 }] }, { l: [{ id: 2 }, { id: 1 }] }).ops).toHaveLength(0);
  });

  it('aceitando tudo produz os mesmos elementos da origem', () => {
    const out = merge(r.root, decide(r.ops.length, ST_ACCEPT)) as { itens: { id: number }[] };
    expect(out.itens.map((x) => x.id).sort()).toEqual([1, 3, 4]);
    expect(out.itens.find((x) => x.id === 1)).toEqual({ id: 1, v: 'A' });
  });

  it('prefere campos como "codigo" e respeita escolha manual', () => {
    const a = [{ codigo: 'x', nome: 'n1' }];
    const b = [{ codigo: 'x', nome: 'n2' }];
    expect(diff(a, b).arrays[0].key).toBe('codigo');
    const r2 = diff(a, b, { strategies: { $: { mode: 'key', key: 'nome' } } });
    expect(r2.ops.map((o) => o.kind).sort()).toEqual(['add', 'del']);
  });
});

describe('arrays sem identificador (alinhamento por conteúdo)', () => {
  it('casa elementos idênticos e compara campo a campo os modificados', () => {
    const A: Json = [{ a: 1 }, { a: 2, b: 'x' }, { a: 3 }];
    const B: Json = [{ a: 1 }, { a: 2, b: 'y' }, { a: 3 }, { a: 4 }];
    const r = diff(A, B);
    expect(r.arrays[0].mode).toBe('content');
    expect(r.ops.map((o) => [o.kind, o.path])).toEqual([
      ['chg', '$[1].b'],
      ['add', '$[+3]'],
    ]);
  });

  it('inserção no meio não desloca as comparações', () => {
    const r = diff(['a', 'b', 'c', 'd'], ['a', 'x', 'b', 'c', 'd']);
    expect(r.ops.map((o) => [o.kind, o.path])).toEqual([['add', '$[+1]']]);
    expect(merge(r.root, decide(1, ST_ACCEPT))).toEqual(['a', 'x', 'b', 'c', 'd']);
  });

  it('alinhamento funciona em sequências grandes (patience)', () => {
    const n = 5000;
    const a = Array.from({ length: n }, (_, i) => 'v' + i);
    const b = a.slice();
    b.splice(100, 1); // remove
    b.splice(2500, 0, 'novo'); // insere
    b[4000] = 'mudou';
    const [ia, ib] = internIds(a, b);
    const pairs = alignByContent(ia, ib);
    const eqCount = pairs.filter(([i, j]) => i >= 0 && j >= 0 && a[i] === b[j]).length;
    expect(eqCount).toBe(n - 2);
  });
});

describe('prévia e formato', () => {
  it('render marca linhas e vírgulas corretamente', () => {
    const r = diff({ a: 1, b: 2 }, { a: 1, c: 3 });
    const d = decide(r.ops.length, ST_ACCEPT);
    const out = render(r.root, d, r.ops.length, '  ');
    const lines = out.text.split('\n');
    const real = lines.filter((_, i) => out.marks[i] !== M.GHOST_REMOVED && out.marks[i] !== M.GHOST_PENDING_ADD && out.marks[i] !== M.GHOST_OLD);
    expect(JSON.parse(real.join('\n'))).toEqual({ a: 1, c: 3 });
    expect(out.opLine[0]).toBeGreaterThan(0);
  });

  it('detecta indentação e fim de linha', () => {
    expect(detectFormat('{\n    "a": 1\n}\n')).toEqual({ indent: '    ', eol: '\n', finalNewline: true });
    expect(detectFormat('{\r\n\t"a": 1\r\n}')).toEqual({ indent: '\t', eol: '\r\n', finalNewline: false });
    expect(detectFormat('{"a":1}').indent).toBe('');
    expect(serialize({ a: 1 }, '  ', '\r\n', true)).toBe('{\r\n  "a": 1\r\n}\r\n');
  });

  it('avisa sobre chaves numéricas', () => {
    expect(inspect({ '1': 1, b: 2 }).warnings).toHaveLength(1);
  });
});
