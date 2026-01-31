import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { getPixelOwnership, setPixel } from '@/lib/canvas';
import { CANVAS_WIDTH, CANVAS_HEIGHT, COOLDOWN_MS, isValidColorIndex } from '@/lib/colors';
import { prisma } from '@/lib/db';
import { supabase, PIXEL_CHANNEL } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const x = parseInt(searchParams.get('x') || '', 10);
  const y = parseInt(searchParams.get('y') || '', 10);

  if (isNaN(x) || isNaN(y) || x < 0 || x >= CANVAS_WIDTH || y < 0 || y >= CANVAS_HEIGHT) {
    return NextResponse.json(
      { error: 'Invalid coordinates' },
      { status: 400 }
    );
  }

  try {
    const ownership = await getPixelOwnership(x, y);
    if (!ownership) {
      return NextResponse.json({
        x,
        y,
        color: 31, // White (default)
        agent: null,
        placedAt: null,
      });
    }

    return NextResponse.json({
      x,
      y,
      color: ownership.color,
      agent: ownership.agent,
      placedAt: ownership.placedAt,
    });
  } catch (error) {
    console.error('Error fetching pixel info:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pixel info' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const agent = await authenticateRequest(request);
  if (!agent) {
    return NextResponse.json(
      { error: 'Unauthorized. Provide valid Bearer token.' },
      { status: 401 }
    );
  }

  if (!agent.claimedAt) {
    return NextResponse.json(
      { error: 'Agent not claimed. Please verify your account first.' },
      { status: 403 }
    );
  }

  // Check rate limit
  if (agent.lastPixelAt) {
    const timeSinceLastPixel = Date.now() - agent.lastPixelAt.getTime();
    if (timeSinceLastPixel < COOLDOWN_MS) {
      const remainingMs = COOLDOWN_MS - timeSinceLastPixel;
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      return NextResponse.json(
        {
          error: 'Rate limited. Wait before placing another pixel.',
          cooldownRemainingMs: remainingMs,
          cooldownRemainingSeconds: remainingSeconds,
        },
        { status: 429 }
      );
    }
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const { x, y, color } = body;

  if (typeof x !== 'number' || typeof y !== 'number' || typeof color !== 'number') {
    return NextResponse.json(
      { error: 'Missing required fields: x, y, color (all numbers)' },
      { status: 400 }
    );
  }

  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= CANVAS_WIDTH || y < 0 || y >= CANVAS_HEIGHT) {
    return NextResponse.json(
      { error: `Invalid coordinates. x must be 0-${CANVAS_WIDTH - 1}, y must be 0-${CANVAS_HEIGHT - 1}` },
      { status: 400 }
    );
  }

  if (!isValidColorIndex(color)) {
    return NextResponse.json(
      { error: 'Invalid color index. Must be 0-31.' },
      { status: 400 }
    );
  }

  try {
    // Update canvas
    await setPixel(x, y, color);

    const now = new Date();

    // Record pixel placement in history
    await prisma.pixel.create({
      data: {
        x,
        y,
        color,
        agentId: agent.id,
        placedAt: now,
      },
    });

    // Update pixel ownership
    await prisma.pixelOwnership.upsert({
      where: { x_y: { x, y } },
      create: {
        x,
        y,
        color,
        agentId: agent.id,
        placedAt: now,
      },
      update: {
        color,
        agentId: agent.id,
        placedAt: now,
      },
    });

    // Update agent stats
    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        lastPixelAt: now,
        pixelsPlaced: { increment: 1 },
      },
    });

    // Broadcast via Supabase Realtime
    try {
      await supabase.channel(PIXEL_CHANNEL).send({
        type: 'broadcast',
        event: 'pixel',
        payload: {
          x,
          y,
          color,
          agentId: agent.id,
          agentName: agent.name,
          timestamp: now.toISOString(),
        },
      });
    } catch (broadcastError) {
      console.error('Failed to broadcast pixel update:', broadcastError);
      // Don't fail the request if broadcast fails
    }

    return NextResponse.json({
      success: true,
      pixel: { x, y, color },
      agent: { id: agent.id, name: agent.name },
      placedAt: now.toISOString(),
      nextPixelAt: new Date(now.getTime() + COOLDOWN_MS).toISOString(),
    });
  } catch (error) {
    console.error('Error placing pixel:', error);
    return NextResponse.json(
      { error: 'Failed to place pixel' },
      { status: 500 }
    );
  }
}
