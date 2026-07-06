import { useState } from 'react';

interface Props {
  disabled: boolean;
  onSubmit: (answer: string) => void;
}

export function FreeText({ disabled, onSubmit }: Props) {
  const [value, setValue] = useState('');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        disabled={disabled}
        placeholder="Write your answer in detail…"
        rows={4}
        style={{
          padding: '10px 14px', borderRadius: 6, border: '1px solid var(--border)',
          background: 'var(--bg-elevated)', color: 'var(--text-primary)',
          fontFamily: 'var(--font-ui)', fontSize: 14, outline: 'none',
          resize: 'vertical', lineHeight: 1.5,
        }}
      />
      <button
        onClick={() => value.trim() && onSubmit(value.trim())}
        disabled={!value.trim() || disabled}
        style={{
          padding: '8px 20px', borderRadius: 6, border: 'none',
          background: 'var(--accent)', color: '#fff', cursor: 'pointer',
          fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600,
          alignSelf: 'flex-start', opacity: !value.trim() || disabled ? 0.5 : 1,
        }}
      >
        Submit
      </button>
    </div>
  );
}
