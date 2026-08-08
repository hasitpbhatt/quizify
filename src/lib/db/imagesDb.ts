import { getDb, STORES } from './db';

export interface StoredImage {
  key: string; // `${sessionId}:${nodeId}`
  blob: Blob;
  mime: string;
  createdAt: number;
}

interface StoredImageRecord {
  key: string;
  bytes: Uint8Array;
  mime: string;
  createdAt: number;
}

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

export async function putImage(
  sessionId: string,
  nodeId: string,
  blob: Blob,
  mime: string,
): Promise<void> {
  const db = await getDb();
  await db.put(STORES.IMAGES, {
    key: `${sessionId}:${nodeId}`,
    bytes: await blobToBytes(blob),
    mime,
    createdAt: Date.now(),
  } satisfies StoredImageRecord);
}

export async function getImage(
  sessionId: string,
  nodeId: string,
): Promise<StoredImage | undefined> {
  const db = await getDb();
  const record = (await db.get(STORES.IMAGES, `${sessionId}:${nodeId}`)) as
    StoredImageRecord | undefined;
  if (!record) return undefined;
  return {
    key: record.key,
    blob: new Blob([record.bytes as BlobPart], { type: record.mime }),
    mime: record.mime,
    createdAt: record.createdAt,
  };
}

export async function deleteImagesForSession(sessionId: string): Promise<void> {
  const db = await getDb();
  const keys = (await db.getAllKeys(STORES.IMAGES)) as string[];
  const sessionKeys = keys.filter((k) => k.startsWith(`${sessionId}:`));
  await Promise.all(sessionKeys.map((k) => db.delete(STORES.IMAGES, k)));
}
