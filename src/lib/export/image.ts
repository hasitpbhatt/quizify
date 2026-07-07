import { toPng } from 'html-to-image';
import type { ReactFlowInstance } from '@xyflow/react';
import type { Session } from '@/shared/types';
import { downloadBlob, sessionFilename } from './types';

export async function exportCanvasAsPng(
  reactFlowInstance: ReactFlowInstance,
  session: Session,
): Promise<void> {
  const container = document.querySelector('.react-flow') as HTMLElement | null;
  if (!container) return;

  const viewport = reactFlowInstance.getViewport();

  await reactFlowInstance.fitView({ duration: 0, padding: 0.1 });
  await new Promise(resolve => requestAnimationFrame(resolve));

  try {
    const dataUrl = await toPng(container, {
      backgroundColor: '#ffffff',
      pixelRatio: 2,
      cacheBust: true,
    });

    const res = await fetch(dataUrl);
    const blob = await res.blob();
    downloadBlob(blob, sessionFilename(session, 'png'));
  } finally {
    reactFlowInstance.setViewport(viewport, { duration: 0 });
  }
}
