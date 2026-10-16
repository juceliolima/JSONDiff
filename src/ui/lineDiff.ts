import { internIds, matchEqual } from '../core/align';

/** Marca linhas exclusivas de cada lado (para destacar dentro do painel de revisão). */
export function lineDiff(a: string[], b: string[]): { aChanged: boolean[]; bChanged: boolean[] } {
  const [ia, ib] = internIds(a, b);
  const aChanged = new Array<boolean>(a.length).fill(true);
  const bChanged = new Array<boolean>(b.length).fill(true);
  for (const [i, j] of matchEqual(ia, ib)) {
    aChanged[i] = false;
    bChanged[j] = false;
  }
  return { aChanged, bChanged };
}
