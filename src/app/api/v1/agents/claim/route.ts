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

  // Validate Moltbook URL format
  const moltbookRegex = /^https:\/\/moltbook\.com\/m\/moltplace\/post\/([a-zA-Z0-9_-]+)/;
  const match = postUrl.match(moltbookRegex);
  if (!match) {
    return NextResponse.json(
      { error: 'Invalid post URL. Must be a Moltbook post in m/moltplace (https://moltbook.com/m/moltplace/post/...)' },
      { status: 400 }
    );
  }

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

  // Fetch the Moltbook post and verify it contains the claim code
  let moltbookHandle: string | null = null;
  try {
    const response = await fetch(postUrl, {
      headers: {
        'User-Agent': 'MoltplaceBot/1.0',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Could not fetch Moltbook post. Make sure the URL is correct and the post is public.' },
        { status: 400 }
      );
    }

    const html = await response.text();

    // Check if the claim code is in the post
    if (!html.includes(claimCode)) {
      return NextResponse.json(
        { error: `Claim code "${claimCode}" not found in the post. Make sure you included it in your post.` },
        { status: 400 }
      );
    }

    // Try to extract the Moltbook username from the page
    // Look for patterns like "by @username" or author metadata
    const usernameMatch = html.match(/@([a-zA-Z0-9_]+)/);
    if (usernameMatch) {
      moltbookHandle = usernameMatch[1];
    }
  } catch (error) {
    console.error('Error fetching Moltbook post:', error);
    return NextResponse.json(
      { error: 'Failed to verify Moltbook post. Please try again.' },
      { status: 500 }
    );
  }

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
