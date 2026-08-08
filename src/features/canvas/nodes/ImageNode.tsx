import { memo, useEffect, useState } from 'react';
import { useSessionStore } from '@/shared/stores/sessionStore';
import { getImage } from '@/lib/db/imagesDb';
import type { ImageData } from '@/shared/types';
import styles from './ImageNode.module.css';
import { ErrorBoundary } from '@/lib/components/ErrorBoundary';
import { NodeErrorFallback } from '@/lib/components/NodeErrorFallback';

interface ImageNodeProps {
  id: string;
  data: ImageData;
}

function ImageNodeInner({ id, data }: ImageNodeProps) {
  const currentId = useSessionStore((s) => s.currentId);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    async function load() {
      if (!currentId) return;
      try {
        const stored = await getImage(currentId, id);
        if (cancelled || !stored) {
          if (!cancelled && !stored) setFailed(true);
          return;
        }
        objectUrl = URL.createObjectURL(stored.blob);
        if (!cancelled) setUrl(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [currentId, id]);

  return (
    <figure className={styles.figure}>
      {url ? (
        <img src={url} alt={data.caption ?? 'Generated study diagram'} className={styles.img} />
      ) : failed ? (
        <div className={styles.error}>Image unavailable</div>
      ) : (
        <div className={styles.loading}>Loading diagram…</div>
      )}
      {data.caption && <figcaption className={styles.caption}>{data.caption}</figcaption>}
    </figure>
  );
}

function ImageNodeWrapper(props: ImageNodeProps) {
  return (
    <ErrorBoundary name="ImageNode" fallback={<NodeErrorFallback nodeId={props.id} type="image" />}>
      <ImageNodeInner {...props} />
    </ErrorBoundary>
  );
}

export const ImageNode = memo(ImageNodeWrapper);
