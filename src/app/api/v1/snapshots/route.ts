import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSnapshot } from '@/lib/r2';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');

  // If an ID is provided, return that specific snapshot image
  if (id) {
    try {
      const snapshot = await prisma.snapshot.findUnique({
        where: { id },
      });

      if (!snapshot) {
        return NextResponse.json(
          { error: 'Snapshot not found' },
          { status: 404 }
        );
      }

      const imageData = await getSnapshot(snapshot.s3Key);
      if (!imageData) {
        return NextResponse.json(
          { error: 'Snapshot image not found in storage' },
          { status: 404 }
        );
      }

      return new NextResponse(new Uint8Array(imageData), {
        headers: {
          'Content-Type': 'image/png',
          'Content-Length': imageData.length.toString(),
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    } catch (error) {
      console.error('Error fetching snapshot:', error);
      return NextResponse.json(
        { error: 'Failed to fetch snapshot' },
        { status: 500 }
      );
    }
  }

  // Otherwise, return list of snapshots
  const limit = parseInt(searchParams.get('limit') || '100', 10);
  const before = searchParams.get('before');

  try {
    const snapshots = await prisma.snapshot.findMany({
      where: before ? { timestamp: { lt: new Date(before) } } : undefined,
      orderBy: { timestamp: 'desc' },
      take: Math.min(limit, 100),
    });

    return NextResponse.json({
      snapshots: snapshots.map(s => ({
        id: s.id,
        timestamp: s.timestamp.toISOString(),
        url: `/api/v1/snapshots?id=${s.id}`,
      })),
      count: snapshots.length,
    });
  } catch (error) {
    console.error('Error listing snapshots:', error);
    return NextResponse.json(
      { error: 'Failed to list snapshots' },
      { status: 500 }
    );
  }
}
