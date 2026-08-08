import { describe, it, expect, beforeEach } from 'vitest';
import { putImage, getImage, deleteImagesForSession } from '@/lib/db/imagesDb';

describe('imagesDb', () => {
  beforeEach(async () => {
    const { getDb, STORES } = await import('@/lib/db/db');
    const db = await getDb();
    const tx = db.transaction(STORES.IMAGES, 'readwrite');
    await tx.objectStore(STORES.IMAGES).clear();
    await tx.done;
  });

  it('stores and retrieves a blob image', async () => {
    const blob = new Blob(['fake-jpeg-bytes'], { type: 'image/jpeg' });
    await putImage('sess1', 'node1', blob, 'image/jpeg');

    const stored = await getImage('sess1', 'node1');
    expect(stored).toBeDefined();
    expect(stored!.mime).toBe('image/jpeg');
    expect(stored!.key).toBe('sess1:node1');
    expect(stored!.blob.type).toBe('image/jpeg');
    expect(stored!.blob.size).toBe(Buffer.byteLength('fake-jpeg-bytes', 'utf8'));
  });

  it('scopes keys by session so identical node ids do not collide', async () => {
    const blob = new Blob(['a'], { type: 'image/png' });
    await putImage('sessA', 'node1', blob, 'image/png');
    await putImage('sessB', 'node1', blob, 'image/png');

    expect(await getImage('sessA', 'node1')).toBeDefined();
    expect(await getImage('sessB', 'node1')).toBeDefined();
  });

  it('returns undefined for a missing key', async () => {
    expect(await getImage('missing', 'node1')).toBeUndefined();
  });

  it('deletes all images for a session', async () => {
    const blob = new Blob(['a'], { type: 'image/png' });
    await putImage('sess1', 'n1', blob, 'image/png');
    await putImage('sess1', 'n2', blob, 'image/png');
    await putImage('sess2', 'n1', blob, 'image/png');

    await deleteImagesForSession('sess1');

    expect(await getImage('sess1', 'n1')).toBeUndefined();
    expect(await getImage('sess1', 'n2')).toBeUndefined();
    expect(await getImage('sess2', 'n1')).toBeDefined();
  });
});
