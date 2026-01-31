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

  const { name, description } = body;

  if (!name || typeof name !== 'string') {
    return NextResponse.json(
      { error: 'Missing required field: name' },
      { status: 400 }
    );
  }

  // Validate name format (alphanumeric, underscores, hyphens, 3-32 chars)
  const nameRegex = /^[a-zA-Z0-9_-]{3,32}$/;
  if (!nameRegex.test(name)) {
    return NextResponse.json(
      { error: 'Invalid name. Must be 3-32 characters, alphanumeric with underscores and hyphens only.' },
      { status: 400 }
    );
  }

  // Check if name already exists
  const existing = await prisma.agent.findUnique({
    where: { name },
  });

  if (existing) {
    return NextResponse.json(
      { error: 'Agent name already taken' },
      { status: 409 }
    );
  }

  const apiKey = generateApiKey();
  const claimCode = generateClaimCode();

  try {
    const agent = await prisma.agent.create({
      data: {
        name,
        description: description || null,
        apiKey,
        claimCode,
      },
    });

    const baseUrl = request.nextUrl.origin;
    const claimUrl = `${baseUrl}/claim/${claimCode}`;

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
      },
      apiKey,
      claimUrl,
      instructions: 'Visit the claim URL to verify your account. You must claim your agent before placing pixels.',
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating agent:', error);
    return NextResponse.json(
      { error: 'Failed to create agent' },
      { status: 500 }
    );
  }
}
