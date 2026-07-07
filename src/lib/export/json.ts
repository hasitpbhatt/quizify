import type { Session } from '@/shared/types';
import { downloadBlob, sessionFilename } from './types';

export function exportSessionJson(session: Session) {
  const json = JSON.stringify(session, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  downloadBlob(blob, sessionFilename(session, 'json'));
}
