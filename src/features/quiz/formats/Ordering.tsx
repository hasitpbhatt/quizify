import { useState, useRef, useCallback } from 'react';
import styles from './Ordering.module.css';

interface Props {
  items: string[];
  disabled: boolean;
  onSubmit: (answer: string[]) => void;
}

export function Ordering({ items, disabled, onSubmit }: Props) {
  const [order, setOrder] = useState(() => [...items].sort(() => Math.random() - 0.5));
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announce = useCallback((msg: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setAnnouncement(msg);
    timeoutRef.current = setTimeout(() => setAnnouncement(''), 2000);
  }, []);

  const moveItem = useCallback(
    (from: number, to: number) => {
      if (disabled) return;
      const next = [...order];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      setOrder(next);
      setFocusIndex(to);
      announce('Moved "' + moved + '" to position ' + (to + 1));
    },
    [order, disabled, announce],
  );

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (disabled) return;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index || disabled) return;
    const next = [...order];
    const draggedItem = next[draggedIndex];
    next.splice(draggedIndex, 1);
    next.splice(index, 0, draggedItem);
    setDraggedIndex(index);
    setOrder(next);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (disabled) return;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        if (index > 0) moveItem(index, index - 1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (index < order.length - 1) moveItem(index, index + 1);
        break;
      case 'Home':
        e.preventDefault();
        if (index > 0) moveItem(index, 0);
        break;
      case 'End':
        e.preventDefault();
        if (index < order.length - 1) moveItem(index, order.length - 1);
        break;
    }
  };

  const itemClass = (isDragging: boolean) => {
    return [styles.item, isDragging ? styles.dragging : '', disabled ? styles.disabledItem : '']
      .filter(Boolean)
      .join(' ');
  };

  return (
    <div className={styles.list} role="listbox" aria-label="Order items">
      <div aria-live="polite" aria-atomic="true" className={styles.srOnly}>
        {announcement}
      </div>
      {order.map((item, i) => {
        const isDragging = i === draggedIndex;
        return (
          <div
            key={item}
            role="option"
            aria-selected={i === focusIndex}
            aria-posinset={i + 1}
            aria-setsize={order.length}
            tabIndex={i === focusIndex ? 0 : -1}
            className={itemClass(isDragging)}
            draggable={!disabled}
            onDragStart={(e) => handleDragStart(e, i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDragEnd={handleDragEnd}
            onKeyDown={(e) => handleKeyDown(e, i)}
            onClick={() => setFocusIndex(i)}
            onFocus={() => setFocusIndex(i)}
          >
            <div className={styles.dragHandle} aria-hidden="true">
              ☰
            </div>
            <span className={styles.index}>{i + 1}.</span>
            <span className={styles.label}>{item}</span>
          </div>
        );
      })}
      <button className={styles.submitBtn} onClick={() => onSubmit(order)} disabled={disabled}>
        Submit Order
      </button>
    </div>
  );
}
