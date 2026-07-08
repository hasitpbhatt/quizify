import { useState } from 'react';
import styles from './Ordering.module.css';

interface Props {
  items: string[];
  disabled: boolean;
  onSubmit: (answer: string[]) => void;
}

export function Ordering({ items, disabled, onSubmit }: Props) {
  const [order, setOrder] = useState(() => [...items].sort(() => Math.random() - 0.5));
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

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

  return (
    <div className={styles.list}>
      {order.map((item, i) => {
        const isDragging = i === draggedIndex;
        return (
          <div
            key={item}
            className={`${styles.item} ${isDragging ? styles.dragging : ''} ${disabled ? styles.disabledItem : ''}`}
            draggable={!disabled}
            onDragStart={(e) => handleDragStart(e, i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDragEnd={handleDragEnd}
          >
            <div className={styles.dragHandle}>☰</div>
            <span className={styles.index}>{i + 1}.</span>
            <span className={styles.label}>{item}</span>
          </div>
        );
      })}
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
