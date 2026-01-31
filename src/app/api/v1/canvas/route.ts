import { NextResponse } from 'next/server';
import { getCanvas } from '@/lib/canvas';

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
