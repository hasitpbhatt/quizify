import { useState, useCallback } from 'react';
import styles from './Ordering.module.css';

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
    <div className={styles.list}>
      {order.map((item, i) => (
        <div key={item} className={styles.item}>
          <span className={styles.index}>{i + 1}.</span>
          <span className={styles.label}>{item}</span>
          <div className={styles.arrowGroup}>
            <button
              className={styles.arrowBtn}
              onClick={() => moveItem(i, -1)}
              disabled={i === 0 || disabled}
            >▲</button>
            <button
              className={styles.arrowBtn}
              onClick={() => moveItem(i, 1)}
              disabled={i === order.length - 1 || disabled}
            >▼</button>
          </div>
        </div>
      ))}
      <button
        className={styles.submitBtn}
        onClick={() => onSubmit(order)}
        disabled={disabled}
      >
        Submit Order
      </button>
    </div>
  );
}
