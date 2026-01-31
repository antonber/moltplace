import { NextResponse } from 'next/server';
import { getCanvas, invalidateCanvasCache } from '@/lib/canvas';
import { prisma } from '@/lib/db';
import { CANVAS_SIZE } from '@/lib/colors';

export async function GET() {
  try {
    const canvas = await getCanvas();
    return new NextResponse(new Uint8Array(canvas), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': canvas.length.toString(),
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Error fetching canvas:', error);
    return NextResponse.json(
      { error: 'Failed to fetch canvas' },
      { status: 500 }
    );
  }
}

// POST to sync canvas with PixelOwnership (rebuild from history)
export async function POST() {
  try {
    // Get all pixel ownerships
    const ownerships = await prisma.pixelOwnership.findMany();

    // Create fresh canvas (all white)
    const canvasData = Buffer.alloc(CANVAS_SIZE, 31);

    // Apply all owned pixels
    for (const pixel of ownerships) {
      const index = pixel.y * 1000 + pixel.x;
      canvasData[index] = pixel.color;
    }

    // Update canvas in DB
    await prisma.canvas.upsert({
      where: { id: 'main' },
      create: { id: 'main', data: canvasData },
      update: { data: canvasData },
    });

    // Invalidate cache
    invalidateCanvasCache();

    return NextResponse.json({
      success: true,
      pixelsSynced: ownerships.length,
    });
  } catch (error) {
    console.error('Error syncing canvas:', error);
    return NextResponse.json(
      { error: 'Failed to sync canvas' },
      { status: 500 }
    );
  }
}
