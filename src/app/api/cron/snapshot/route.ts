import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { canvasToPng } from '@/lib/canvas';
import { uploadSnapshot, getSnapshotKey } from '@/lib/r2';

// Vercel Cron configuration
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // Verify cron secret (for Vercel Cron jobs)
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('Starting snapshot...');
    const startTime = Date.now();

    // Generate PNG from canvas
    const pngBuffer = await canvasToPng();
    console.log(`PNG generated: ${pngBuffer.length} bytes`);

    // Upload to R2
    const timestamp = new Date();
    const s3Key = getSnapshotKey(timestamp);

    await uploadSnapshot(s3Key, pngBuffer);
    console.log(`Uploaded to R2: ${s3Key}`);

    // Record snapshot in database
    const snapshot = await prisma.snapshot.create({
      data: {
        timestamp,
        s3Key,
      },
    });

    const elapsed = Date.now() - startTime;
    console.log(`Snapshot completed in ${elapsed}ms`);

    return NextResponse.json({
      success: true,
      snapshot: {
        id: snapshot.id,
        timestamp: snapshot.timestamp.toISOString(),
        s3Key: snapshot.s3Key,
      },
      elapsed,
    });
  } catch (error) {
    console.error('Snapshot failed:', error);
    return NextResponse.json(
      { error: 'Failed to create snapshot' },
      { status: 500 }
    );
  }
}
