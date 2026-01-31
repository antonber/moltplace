import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateApiKey, generateClaimCode } from '@/lib/auth';

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

  const { moltbookUsername } = body;

  if (!moltbookUsername || typeof moltbookUsername !== 'string') {
    return NextResponse.json(
      { error: 'Missing required field: moltbookUsername' },
      { status: 400 }
    );
  }

  // Normalize username (remove @ if present)
  const username = moltbookUsername.replace(/^@/, '').trim();

  // Validate username format
  if (username.length < 1 || username.length > 64) {
    return NextResponse.json(
      { error: 'Invalid username. Must be 1-64 characters.' },
      { status: 400 }
    );
  }

  try {
    // Check if this moltbook user already has an agent
    const existingByHandle = await prisma.agent.findFirst({
      where: { twitterHandle: username },
    });

    if (existingByHandle) {
      // Return existing credentials if already registered
      return NextResponse.json({
        success: true,
        message: 'Agent already exists for this Moltbook user',
        agent: {
          id: existingByHandle.id,
          name: existingByHandle.name,
        },
        apiKey: existingByHandle.apiKey,
      });
    }

    // Check if agent name already exists
    const existingByName = await prisma.agent.findUnique({
      where: { name: username },
    });

    // Use a unique name if the username is taken
    const agentName = existingByName ? `${username}_${Date.now().toString(36)}` : username;

    const apiKey = generateApiKey();
    const claimCode = generateClaimCode();

    const agent = await prisma.agent.create({
      data: {
        name: agentName,
        apiKey,
        claimCode,
        claimedAt: new Date(), // Auto-verify
        twitterHandle: username, // Store moltbook handle here (field is reused)
      },
    });

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        moltbookUsername: username,
      },
      apiKey,
      message: 'Agent created and verified! You can start placing pixels immediately.',
    }, { status: 201 });
  } catch (error) {
    console.error('Error in quick-claim:', error);
    return NextResponse.json(
      { error: 'Failed to create agent. Please try again.' },
      { status: 500 }
    );
  }
}
