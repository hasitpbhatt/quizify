import { useState } from 'react';

interface Props {
  options: string[];
  disabled: boolean;
  onSubmit: (answer: string) => void;
}

export function MultipleChoice({ options, disabled, onSubmit }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {options.map((opt, i) => (
        <label key={i} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
          borderRadius: 6, cursor: disabled ? 'default' : 'pointer',
          background: selected === opt ? 'var(--accent)' : 'var(--bg-elevated)',
          color: selected === opt ? '#fff' : 'var(--text-primary)',
          border: '1px solid var(--border)',
          fontSize: 13, fontFamily: 'var(--font-ui)',
          transition: 'background 0.15s, color 0.15s',
        }}>
          <input
            type="radio"
            name="mcq"
            value={opt}
            checked={selected === opt}
            onChange={() => setSelected(opt)}
            disabled={disabled}
            style={{ accentColor: 'var(--accent)' }}
          />
          {opt}
        </label>
      ))}
      <button
        onClick={() => selected && onSubmit(selected)}
        disabled={!selected || disabled}
        style={{
          padding: '8px 20px', borderRadius: 6, border: 'none',
          background: 'var(--accent)', color: '#fff', cursor: 'pointer',
          fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600,
          marginTop: 4, opacity: !selected || disabled ? 0.5 : 1,
        }}
      >
        Submit
      </button>
    </div>
  );
}
