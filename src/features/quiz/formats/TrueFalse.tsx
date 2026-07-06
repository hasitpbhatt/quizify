import { useState } from 'react';

interface Props {
  disabled: boolean;
  onSubmit: (answer: string) => void;
}

export function TrueFalse({ disabled, onSubmit }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
      {['true', 'false'].map(val => (
        <button
          key={val}
          onClick={() => { setSelected(val); onSubmit(val); }}
          disabled={disabled}
          style={{
            flex: 1, padding: '10px 0', borderRadius: 6, border: '2px solid',
            borderColor: selected === val ? 'var(--accent)' : 'var(--border)',
            background: selected === val ? 'var(--accent)' : 'var(--bg-elevated)',
            color: selected === val ? '#fff' : 'var(--text-primary)',
            cursor: disabled ? 'default' : 'pointer',
            fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: 1,
            transition: 'all 0.15s',
          }}
        >
          {val === 'true' ? 'True' : 'False'}
        </button>
      ))}
    </div>
  );
}
