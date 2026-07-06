import { useState, useCallback } from 'react';

interface Props {
  items: string[];
  disabled: boolean;
  onSubmit: (answer: string[]) => void;
}

export function Ordering({ items, disabled, onSubmit }: Props) {
  const [order, setOrder] = useState(() => [...items].sort(() => Math.random() - 0.5));

  const moveItem = useCallback((fromIndex: number, direction: -1 | 1) => {
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= order.length) return;
    const next = [...order];
    [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
    setOrder(next);
  }, [order]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {order.map((item, i) => (
        <div key={item} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 6,
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          fontSize: 13, fontFamily: 'var(--font-ui)', color: 'var(--text-primary)',
        }}>
          <span style={{ color: 'var(--text-secondary)', fontWeight: 600, width: 20 }}>{i + 1}.</span>
          <span style={{ flex: 1 }}>{item}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <button
              onClick={() => moveItem(i, -1)}
              disabled={i === 0 || disabled}
              style={{
                padding: '2px 8px', border: '1px solid var(--border)',
                borderRadius: 3, background: 'var(--bg-canvas)',
                cursor: disabled ? 'default' : 'pointer',
                color: 'var(--text-secondary)', fontSize: 11,
                opacity: i === 0 ? 0.3 : 1,
              }}
            >▲</button>
            <button
              onClick={() => moveItem(i, 1)}
              disabled={i === order.length - 1 || disabled}
              style={{
                padding: '2px 8px', border: '1px solid var(--border)',
                borderRadius: 3, background: 'var(--bg-canvas)',
                cursor: disabled ? 'default' : 'pointer',
                color: 'var(--text-secondary)', fontSize: 11,
                opacity: i === order.length - 1 ? 0.3 : 1,
              }}
            >▼</button>
          </div>
        </div>
      ))}
      <button
        onClick={() => onSubmit(order)}
        disabled={disabled}
        style={{
          padding: '8px 20px', borderRadius: 6, border: 'none',
          background: 'var(--accent)', color: '#fff', cursor: 'pointer',
          fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600,
          alignSelf: 'flex-start', marginTop: 4, opacity: disabled ? 0.5 : 1,
        }}
      >
        Submit Order
      </button>
    </div>
  );
}
