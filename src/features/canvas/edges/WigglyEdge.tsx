import { memo, useEffect, useRef } from 'react';
import { getSmoothStepPath, type EdgeProps, type Edge } from '@xyflow/react';
import rough from 'roughjs';

export type WigglyEdgeType = Edge<Record<string, never>, 'wiggly'>;

function WigglyEdgeComponent(props: EdgeProps) {
  const {
    sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition, selected,
  } = props;

  const [path] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  const gRef = useRef<SVGGElement>(null);

  useEffect(() => {
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
      <path d={path} fill="none" stroke="transparent" strokeWidth={20} style={{ cursor: 'pointer' }} />
      <g ref={gRef} />
    </>
  );
}

export const WigglyEdge = memo(WigglyEdgeComponent);
