// Hold a widget (~0.45 s), then drag it up or down; the others make room, like moving icons on an iPhone.
// The order is saved per phone in settings.
import { useEffect, useRef } from 'preact/hooks';

/** Keys in the saved order; new widgets go to the end, removed ones are dropped. */
export function orderKeys(keys, saved) {
  const known = (saved || []).filter((k) => keys.includes(k));
  return [...known, ...keys.filter((k) => !known.includes(k))];
}

export function SortableStack({ items, order, onOrder, class: cls = 'stack' }) {
  const ref = useRef(null);
  const cb = useRef(onOrder);
  cb.current = onOrder;
  const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
  const keys = orderKeys(items.map((i) => i.key), order);

  useEffect(() => {
    const el = ref.current;
    let timer = null, start = null, drag = null, blockClick = false;
    const pt = (e) => (e.touches ? e.touches[0] || e.changedTouches[0] : e);

    const layout = () => {
      const d = drag, sy = window.scrollY;
      const dy = d.lastY + sy - d.y0;
      const { rects, from, list } = d;
      const shift = rects[from].h + d.gap;
      list[from].style.transform = `translateY(${dy}px) scale(1.02)`;
      const c = rects[from].top + dy + rects[from].h / 2;
      let to = from;
      for (let i = 0; i < from; i++) if (c < rects[i].top + rects[i].h / 2) { to = i; break; }
      if (to === from) for (let i = rects.length - 1; i > from; i--) if (c > rects[i].top + rects[i].h / 2) { to = i; break; }
      d.to = to;
      list.forEach((k, i) => {
        if (i === from) return;
        const s = from < to && i > from && i <= to ? -shift : to < from && i >= to && i < from ? shift : 0;
        k.style.transform = s ? `translateY(${s}px)` : '';
      });
    };
    const loop = () => {
      if (!drag) return;
      const y = drag.lastY, h = window.innerHeight;
      const v = y < 100 ? -(100 - y) / 5 : y > h - 140 ? (y - (h - 140)) / 5 : 0; // scroll near the edges
      if (v) { window.scrollBy(0, v); layout(); }
      drag.raf = requestAnimationFrame(loop);
    };
    const begin = () => {
      const list = [...el.children].filter((k) => k.dataset.sort);
      const from = list.indexOf(start.item);
      if (from < 0) return;
      const sy = window.scrollY;
      const rects = list.map((k) => { const r = k.getBoundingClientRect(); return { top: r.top + sy, h: r.height }; });
      const gap = rects[1] ? Math.max(0, rects[1].top - rects[0].top - rects[0].h) : 16;
      drag = { list, rects, from, to: from, gap, y0: start.y + sy, lastY: start.y };
      start.item.classList.add('lifted');
      el.classList.add('sorting');
      try { navigator.vibrate?.(12); } catch { /* not supported */ }
      window.getSelection?.().removeAllRanges();
      loop();
    };
    const down = (e) => {
      if (e.button > 0) return;
      const item = e.target.closest('[data-sort]');
      if (!item || item.parentElement !== el) return;
      const p = pt(e);
      start = { x: p.clientX, y: p.clientY, item };
      clearTimeout(timer);
      timer = setTimeout(begin, 450);
    };
    const move = (e) => {
      const p = pt(e);
      if (!drag) {
        if (start && (Math.abs(p.clientX - start.x) > 8 || Math.abs(p.clientY - start.y) > 8)) { clearTimeout(timer); start = null; }
        return;
      }
      if (e.cancelable) e.preventDefault();
      e.stopPropagation(); // carousels and swipe rows inside don't move while a widget is dragged
      drag.lastY = p.clientY;
      layout();
    };
    const up = (e) => {
      clearTimeout(timer);
      start = null;
      if (!drag) return;
      const d = drag;
      drag = null;
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      cancelAnimationFrame(d.raf);
      d.list.forEach((k) => { k.style.transform = ''; k.classList.remove('lifted'); });
      el.classList.remove('sorting');
      blockClick = true;
      setTimeout(() => { blockClick = false; }, 80);
      if (d.to !== d.from) {
        const ks = d.list.map((k) => k.dataset.sort);
        const [m] = ks.splice(d.from, 1);
        ks.splice(d.to, 0, m);
        cb.current(ks);
      }
    };
    const click = (e) => { if (blockClick) { e.preventDefault(); e.stopPropagation(); } };
    const menu = (e) => { if (drag || start) e.preventDefault(); };
    el.addEventListener('touchstart', down, { passive: true, capture: true });
    el.addEventListener('touchmove', move, { passive: false, capture: true });
    el.addEventListener('touchend', up, { capture: true });
    el.addEventListener('touchcancel', up, { capture: true });
    el.addEventListener('mousedown', down, true);
    window.addEventListener('mousemove', move, true);
    window.addEventListener('mouseup', up, true);
    el.addEventListener('click', click, true);
    el.addEventListener('contextmenu', menu);
    return () => {
      clearTimeout(timer);
      el.removeEventListener('touchstart', down, { capture: true });
      el.removeEventListener('touchmove', move, { capture: true });
      el.removeEventListener('touchend', up, { capture: true });
      el.removeEventListener('touchcancel', up, { capture: true });
      el.removeEventListener('mousedown', down, true);
      window.removeEventListener('mousemove', move, true);
      window.removeEventListener('mouseup', up, true);
      el.removeEventListener('click', click, true);
      el.removeEventListener('contextmenu', menu);
    };
  }, []);

  return (
    <div class={`${cls} sortable`} ref={ref}>
      {keys.map((k) => <div key={k} data-sort={k} class="sort-item">{byKey[k].node}</div>)}
    </div>
  );
}
