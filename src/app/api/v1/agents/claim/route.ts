import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const { claimCode, tweetUrl } = body;

  if (!claimCode || typeof claimCode !== 'string') {
    return NextResponse.json(
      { error: 'Missing required field: claimCode' },
      { status: 400 }
    );
  }

  if (!tweetUrl || typeof tweetUrl !== 'string') {
    return NextResponse.json(
      { error: 'Missing required field: tweetUrl' },
      { status: 400 }
    );
  }

  // Validate tweet URL format
  const tweetRegex = /^https:\/\/(twitter\.com|x\.com)\/([a-zA-Z0-9_]+)\/status\/\d+/;
  const match = tweetUrl.match(tweetRegex);
  if (!match) {
    return NextResponse.json(
      { error: 'Invalid tweet URL. Must be a valid Twitter/X status URL.' },
      { status: 400 }
    );
  }

  const twitterHandle = match[2];

  // Find agent by claim code
  const agent = await prisma.agent.findUnique({
    where: { claimCode },
  });

  if (!agent) {
    return NextResponse.json(
      { error: 'Invalid claim code' },
      { status: 404 }
    );
  }

  if (agent.claimedAt) {
    return NextResponse.json(
      { error: 'Agent already claimed' },
      { status: 400 }
    );
  }

  // In a production environment, you would verify the tweet content here
  // by fetching the tweet and checking it contains the claim code.
  // For now, we trust the user and just record the twitter handle.

  try {
    const updatedAgent = await prisma.agent.update({
      where: { id: agent.id },
      data: {
        claimedAt: new Date(),
        twitterHandle,
      },
    });

    return NextResponse.json({
      success: true,
      agent: {
        id: updatedAgent.id,
        name: updatedAgent.name,
        twitterHandle: updatedAgent.twitterHandle,
        claimedAt: updatedAgent.claimedAt,
      },
      message: 'Agent claimed successfully! You can now place pixels.',
    });
  } catch (error) {
    console.error('Error claiming agent:', error);
    return NextResponse.json(
      { error: 'Failed to claim agent' },
      { status: 500 }
    );
  }
}
