import { useState } from 'react';
import styles from './MultipleChoice.module.css';

interface Props {
  options: string[];
  disabled: boolean;
  onSubmit: (answer: string) => void;
}

export function MultipleChoice({ options, disabled, onSubmit }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className={styles.list}>
      {options.map((opt, i) => (
        <label
          key={i}
          className={`${styles.option} ${selected === opt ? styles.optionSelected : styles.optionDefault}`}
          style={{ cursor: disabled ? 'default' : 'pointer' }}
        >
          <input
            type="radio"
            name="mcq"
            value={opt}
            checked={selected === opt}
            onChange={() => setSelected(opt)}
            disabled={disabled}
            className={styles.radio}
          />
          {opt}
        </label>
      ))}
      <button
        className={styles.submitBtn}
        onClick={() => selected && onSubmit(selected)}
        disabled={!selected || disabled}
      >
        Submit
      </button>
    </div>
  );
}
