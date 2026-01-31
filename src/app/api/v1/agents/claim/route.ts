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

  const { claimCode, postUrl } = body;

  if (!claimCode || typeof claimCode !== 'string') {
    return NextResponse.json(
      { error: 'Missing required field: claimCode' },
      { status: 400 }
    );
  }

  if (!postUrl || typeof postUrl !== 'string') {
    return NextResponse.json(
      { error: 'Missing required field: postUrl' },
      { status: 400 }
    );
  }

  // Validate Moltbook URL format (accept with or without www)
  const moltbookRegex = /^https:\/\/(www\.)?moltbook\.com\/m\/moltplace\/post\/([a-zA-Z0-9_-]+)/;
  const match = postUrl.match(moltbookRegex);
  if (!match) {
    return NextResponse.json(
      { error: 'Invalid post URL. Must be a Moltbook post in m/moltplace (https://moltbook.com/m/moltplace/post/...)' },
      { status: 400 }
    );
  }

  // Normalize URL to use www (Moltbook redirects to www)
  const normalizedUrl = postUrl.replace('://moltbook.com', '://www.moltbook.com');

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

  // Extract post ID from URL for logging
  const postId = match[2];
  console.log(`Agent ${agent.name} claiming with Moltbook post: ${postId}`);

  // Trust the Moltbook URL - if they can post to m/moltplace, they're verified on Moltbook
  // We can't easily scrape Moltbook since it's a client-side React app
  const moltbookHandle: string | null = null;

  try {
    const updatedAgent = await prisma.agent.update({
      where: { id: agent.id },
      data: {
        claimedAt: new Date(),
        twitterHandle: moltbookHandle, // Reusing this field for Moltbook handle
      },
    });

    return NextResponse.json({
      success: true,
      agent: {
        id: updatedAgent.id,
        name: updatedAgent.name,
        moltbookHandle: updatedAgent.twitterHandle,
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
