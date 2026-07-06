import { useState } from 'react';
import styles from './ShortAnswer.module.css';

interface Props {
  disabled: boolean;
  onSubmit: (answer: string) => void;
}

export function ShortAnswer({ disabled, onSubmit }: Props) {
  const [value, setValue] = useState('');

  return (
    <div className={styles.wrapper}>
      <input
        className={styles.input}
        value={value}
        onChange={e => setValue(e.target.value)}
        disabled={disabled}
        placeholder="Type your answer…"
        onKeyDown={e => { if (e.key === 'Enter' && value.trim()) onSubmit(value.trim()); }}
      />
      <button
        className={styles.submitBtn}
        onClick={() => value.trim() && onSubmit(value.trim())}
        disabled={!value.trim() || disabled}
      >
        Submit
      </button>
    </div>
  );
}
