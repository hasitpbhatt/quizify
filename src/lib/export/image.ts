import html2canvas from 'html2canvas';
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
    const canvas = await html2canvas(container, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
    });

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/png'),
    );

    if (blob) {
      downloadBlob(blob, sessionFilename(session, 'png'));
    }
  } finally {
    reactFlowInstance.setViewport(viewport, { duration: 0 });
  }
}
