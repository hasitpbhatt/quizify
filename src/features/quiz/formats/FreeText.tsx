import { useState } from 'react';
import styles from './FreeText.module.css';

interface Props {
  disabled: boolean;
  onSubmit: (answer: string) => void;
}

export function FreeText({ disabled, onSubmit }: Props) {
  const [value, setValue] = useState('');

  return (
    <div className={styles.wrapper}>
      <textarea
        className={styles.textarea}
        value={value}
        onChange={e => setValue(e.target.value)}
        disabled={disabled}
        placeholder="Write your answer in detail…"
        rows={4}
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
