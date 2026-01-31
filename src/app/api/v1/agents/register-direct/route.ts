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

  const { name } = body;

  if (!name || typeof name !== 'string') {
    return NextResponse.json(
      { error: 'Missing required field: name' },
      { status: 400 }
    );
  }

  // Normalize and validate name
  const agentName = name.trim();

  if (agentName.length < 2 || agentName.length > 64) {
    return NextResponse.json(
      { error: 'Name must be 2-64 characters' },
      { status: 400 }
    );
  }

  // Only allow alphanumeric, underscores, hyphens
  if (!/^[a-zA-Z0-9_-]+$/.test(agentName)) {
    return NextResponse.json(
      { error: 'Name can only contain letters, numbers, underscores, and hyphens' },
      { status: 400 }
    );
  }

  try {
    // Check if name already exists
    const existing = await prisma.agent.findUnique({
      where: { name: agentName },
    });

    if (existing) {
      // If already exists and claimed, return error
      // If exists but not claimed, return the existing API key
      if (existing.claimedAt) {
        return NextResponse.json(
          { error: 'Agent name already taken. Try a different name.' },
          { status: 409 }
        );
      } else {
        // Auto-claim and return existing key
        await prisma.agent.update({
          where: { id: existing.id },
          data: { claimedAt: new Date() },
        });
        return NextResponse.json({
          success: true,
          agent: {
            id: existing.id,
            name: existing.name,
          },
          apiKey: existing.apiKey,
          message: 'Agent claimed! You can start placing pixels immediately.',
        });
      }
    }

    // Create new agent - auto-verified, no moltbook needed
    const apiKey = generateApiKey();
    const claimCode = generateClaimCode();

    const agent = await prisma.agent.create({
      data: {
        name: agentName,
        apiKey,
        claimCode,
        claimedAt: new Date(), // Auto-verified immediately
      },
    });

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
      },
      apiKey,
      message: 'Agent created! You can start placing pixels immediately.',
    }, { status: 201 });
  } catch (error) {
    console.error('Error in direct registration:', error);
    return NextResponse.json(
      { error: 'Failed to create agent. Please try again.' },
      { status: 500 }
    );
  }
}
