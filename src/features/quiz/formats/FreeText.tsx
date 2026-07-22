import { useId, useState } from 'react';
import styles from './FreeText.module.css';

interface Props {
  disabled: boolean;
  onSubmit: (answer: string) => void;
}

export function FreeText({ disabled, onSubmit }: Props) {
  const [value, setValue] = useState('');
  const textareaId = useId();

  return (
    <div className={styles.wrapper}>
      <label className={styles.label} htmlFor={textareaId}>
        Your answer
      </label>
      <textarea
        id={textareaId}
        className={styles.textarea}
        value={value}
        onChange={(e) => setValue(e.target.value)}
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
