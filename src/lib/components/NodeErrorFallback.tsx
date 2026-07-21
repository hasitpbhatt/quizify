import type { NodeKind } from '@/shared/types';

interface NodeErrorFallbackProps {
  nodeId: string;
  type: NodeKind;
  onDismiss?: () => void;
}

export function NodeErrorFallback({ nodeId, type, onDismiss }: NodeErrorFallbackProps) {
  return (
    <div
      style={{
        width: 280,
        padding: '12px 16px',
        borderRadius: 8,
        border: '1px dashed var(--border, #e0e0e0)',
        background: 'var(--bg-elevated, #fafafa)',
        fontSize: 12,
        fontFamily: 'var(--font-ui, sans-serif)',
        color: 'var(--text-secondary, #888)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 14 }}>&#9888;</span>
        <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{type} node</span>
      </div>
      <div>Failed to render</div>
      <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>id: {nodeId}</div>
      {onDismiss && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          style={{
            marginTop: 6,
            padding: '2px 8px',
            borderRadius: 4,
            border: '1px solid var(--border, #e0e0e0)',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: 11,
            color: 'var(--text-secondary, #888)',
          }}
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
