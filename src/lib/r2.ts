import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'moltplace-snapshots';

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

export async function uploadSnapshot(key: string, data: Buffer): Promise<void> {
  await r2Client.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: data,
    ContentType: 'image/png',
  }));
}

export async function getSnapshot(key: string): Promise<Buffer | null> {
  try {
    const response = await r2Client.send(new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    }));
    if (!response.Body) return null;
    const chunks: Uint8Array[] = [];
    const stream = response.Body as AsyncIterable<Uint8Array>;
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

export async function listSnapshots(maxKeys = 100): Promise<string[]> {
  const response = await r2Client.send(new ListObjectsV2Command({
    Bucket: R2_BUCKET_NAME,
    MaxKeys: maxKeys,
  }));
  return (response.Contents || []).map(obj => obj.Key!).filter(Boolean);
}

export function getSnapshotKey(timestamp: Date): string {
  return `snapshots/${timestamp.toISOString().replace(/[:.]/g, '-')}.png`;
}

export function getSnapshotUrl(key: string): string {
  // For public bucket access, adjust this URL pattern based on your R2 configuration
  return `https://${R2_BUCKET_NAME}.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;
}
