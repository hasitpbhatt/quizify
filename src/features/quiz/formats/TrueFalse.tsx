import { useState } from 'react';
import styles from './TrueFalse.module.css';

interface Props {
  disabled: boolean;
  onSubmit: (answer: string) => void;
}

export function TrueFalse({ disabled, onSubmit }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className={styles.row}>
      {['true', 'false'].map(val => (
        <button
          key={val}
          className={`${styles.btn} ${selected === val ? styles.btnSelected : ''}`}
          onClick={() => { setSelected(val); onSubmit(val); }}
          disabled={disabled}
        >
          {val === 'true' ? 'True' : 'False'}
        </button>
      ))}
    </div>
  );
}
