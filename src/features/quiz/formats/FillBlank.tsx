import { useState } from 'react';

interface Props {
  blankedSentence: string;
  disabled: boolean;
  onSubmit: (answer: string) => void;
}

export function FillBlank({ blankedSentence, disabled, onSubmit }: Props) {
  const [value, setValue] = useState('');
  const parts = blankedSentence.split('___');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{
        fontSize: 14, lineHeight: 1.6, color: 'var(--text-primary)',
        fontFamily: 'var(--font-ui)',
      }}>
        {parts[0]}
        <input
          value={value}
          onChange={e => setValue(e.target.value)}
          disabled={disabled}
          style={{
            padding: '4px 8px', borderRadius: 4, border: '1px solid var(--accent)',
            background: 'var(--bg-elevated)', color: 'var(--text-primary)',
            fontFamily: 'var(--font-ui)', fontSize: 14, width: 160,
            margin: '0 4px', outline: 'none',
          }}
        />
        {parts[1] || ''}
      </div>
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
