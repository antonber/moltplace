import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { COOLDOWN_MS } from '@/lib/colors';

export async function GET(request: NextRequest) {
  const agent = await authenticateRequest(request);
  if (!agent) {
    return NextResponse.json(
      { error: 'Unauthorized. Provide valid Bearer token.' },
      { status: 401 }
    );
  }

  const now = Date.now();
  let cooldownRemainingMs = 0;
  let canPlace = true;

  if (agent.lastPixelAt) {
    const timeSinceLastPixel = now - agent.lastPixelAt.getTime();
    if (timeSinceLastPixel < COOLDOWN_MS) {
      cooldownRemainingMs = COOLDOWN_MS - timeSinceLastPixel;
      canPlace = false;
    }
  }

  return NextResponse.json({
    id: agent.id,
    name: agent.name,
    description: agent.description,
    twitterHandle: agent.twitterHandle,
    claimed: !!agent.claimedAt,
    claimedAt: agent.claimedAt,
    pixelsPlaced: agent.pixelsPlaced,
    lastPixelAt: agent.lastPixelAt,
    canPlace,
    cooldownRemainingMs,
    cooldownRemainingSeconds: Math.ceil(cooldownRemainingMs / 1000),
    nextPixelAt: agent.lastPixelAt
      ? new Date(agent.lastPixelAt.getTime() + COOLDOWN_MS).toISOString()
      : null,
    createdAt: agent.createdAt,
  });
}
