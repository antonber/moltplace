import { NextResponse } from 'next/server';
import { canvasToPng } from '@/lib/canvas';

export async function GET() {
  try {
    const png = await canvasToPng();
    return new NextResponse(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': png.length.toString(),
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (error) {
    console.error('Error generating screenshot:', error);
    return NextResponse.json(
      { error: 'Failed to generate screenshot' },
      { status: 500 }
    );
  }
}
