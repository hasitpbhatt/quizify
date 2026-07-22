import { useId, useState } from 'react';
import styles from './FillBlank.module.css';

interface Props {
  blankedSentence: string;
  disabled: boolean;
  onSubmit: (answer: string) => void;
}

export function FillBlank({ blankedSentence, disabled, onSubmit }: Props) {
  const [value, setValue] = useState('');
  const parts = blankedSentence.split('___');
  const inputId = useId();

  return (
    <div className={styles.wrapper}>
      <label className={styles.label} htmlFor={inputId}>
        Fill in the blank
      </label>
      <div className={styles.sentence}>
        {parts[0]}
        <input
          id={inputId}
          className={styles.blankInput}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
        />
        {parts[1] || ''}
      </div>
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
