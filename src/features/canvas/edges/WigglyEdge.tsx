import { memo, useEffect, useRef } from 'react';
import { getSmoothStepPath, type EdgeProps, type Edge } from '@xyflow/react';
import rough from 'roughjs';

export type WigglyEdgeType = Edge<Record<string, never>, 'wiggly'>;

const DASH_STYLE = `
@keyframes edgeDash {
  to { stroke-dashoffset: -40; }
}
.wigglyFlowPath {
  animation: edgeDash 5s linear infinite;
  pointer-events: none;
}
`;

// Inject style once
let _styleInjected = false;
function injectStyle() {
  if (_styleInjected) return;
  _styleInjected = true;
  const s = document.createElement('style');
  s.textContent = DASH_STYLE;
  document.head.appendChild(s);
}

function WigglyEdgeComponent(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected } = props;

  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const gRef = useRef<SVGGElement>(null);

  useEffect(() => {
    injectStyle();
    if (!gRef.current) return;
    const svg = gRef.current.closest('svg');
    if (!svg) return;

    gRef.current.innerHTML = '';

    const rc = rough.svg(svg);
    const roughPath = rc.path(path, {
      roughness: 1.8,
      stroke: selected ? 'var(--accent)' : '#888',
      strokeWidth: 1.5,
      fill: undefined,
    });
    gRef.current.appendChild(roughPath);
  }, [path, selected]);

  return (
    <>
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ cursor: 'pointer' }}
      />
      <g ref={gRef} />
      {/* Subtle animated dash overlay for "alive" feeling */}
      <path
        d={path}
        fill="none"
        stroke={selected ? 'var(--accent)' : 'var(--accent)'}
        strokeWidth={1.2}
        strokeDasharray="6 10"
        strokeOpacity={selected ? 0.35 : 0.12}
        className="wigglyFlowPath"
        style={{ pointerEvents: 'none' }}
      />
    </>
  );
}

export const WigglyEdge = memo(WigglyEdgeComponent);
