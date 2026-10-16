import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Altura máxima do conteúdo rolável; acima disso a rolagem é escalonada (navegadores limitam a altura). */
const MAX_PX = 8_000_000;

interface Props {
  count: number;
  rowHeight: number;
  renderRow: (index: number, style: React.CSSProperties) => ReactNode;
  /** Rola até o índice quando `nonce` muda. */
  scrollTo?: { index: number; nonce: number } | null;
  className?: string;
  overscan?: number;
}

export function VirtualList({ count, rowHeight, renderRow, scrollTo, className, overscan = 8 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [height, setHeight] = useState(600);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    setHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const total = count * rowHeight;
  const virt = Math.min(total, MAX_PX);
  const ratio = total > MAX_PX ? Math.max(0, total - height) / Math.max(1, virt - height) : 1;
  const realTop = top * ratio;

  useEffect(() => {
    const el = ref.current;
    if (!el || !scrollTo || scrollTo.index < 0) return;
    const y = scrollTo.index * rowHeight;
    const curTop = el.scrollTop * ratio;
    if (y >= curTop + rowHeight && y <= curTop + el.clientHeight - rowHeight * 2) return; // já visível
    const desired = Math.max(0, y - el.clientHeight / 3);
    el.scrollTop = desired / ratio;
  }, [scrollTo?.nonce]);

  // mantém a posição válida quando a lista encolhe
  useEffect(() => {
    const el = ref.current;
    if (el && el.scrollTop > virt) el.scrollTop = 0;
  }, [virt]);

  const first = Math.max(0, Math.floor(realTop / rowHeight) - overscan);
  const last = Math.min(count, Math.ceil((realTop + height) / rowHeight) + overscan);
  const rows: ReactNode[] = [];
  for (let i = first; i < last; i++) {
    rows.push(renderRow(i, { position: 'absolute', top: top + (i * rowHeight - realTop), height: rowHeight, left: 0, minWidth: '100%' }));
  }

  return (
    <div ref={ref} className={'vlist ' + (className ?? '')} onScroll={(e) => setTop(e.currentTarget.scrollTop)}>
      <div style={{ height: virt, position: 'relative' }}>{rows}</div>
    </div>
  );
}
