import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { setPixel } from '@/lib/canvas';
import { extractPixelCommands } from '@/lib/pixelParser';
import { generateApiKey, generateClaimCode } from '@/lib/auth';
import { COOLDOWN_MS, COLOR_NAMES } from '@/lib/colors';
import { supabase, PIXEL_CHANNEL } from '@/lib/supabase';

const MOLTBOOK_API = 'https://moltbook.com/api/v1/posts';
const SUBMOLT = 'moltplace';

interface MoltbookPost {
  id: string;
  title: string;
  content: string;
  author: {
    id: string;
    name: string;
  };
  created_at: string;
}

interface MoltbookResponse {
  success: boolean;
  posts: MoltbookPost[];
  has_more: boolean;
  next_offset: number;
}

async function fetchMoltbookPosts(limit = 25): Promise<MoltbookPost[]> {
  const response = await fetch(`${MOLTBOOK_API}?submolt=${SUBMOLT}&limit=${limit}`, {
    headers: {
      'User-Agent': 'MoltplaceBot/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Moltbook posts: ${response.status}`);
  }

  const data: MoltbookResponse = await response.json();
  return data.posts || [];
}

async function getOrCreateAgent(moltbookUsername: string, moltbookUserId?: string) {
  // Check if agent exists by twitter handle (we use this field for moltbook username)
  let agent = await prisma.agent.findFirst({
    where: { twitterHandle: moltbookUsername },
  });

  if (!agent) {
    // Create new agent
    const apiKey = generateApiKey();
    const claimCode = generateClaimCode();

    // Check if name is taken
    const existingByName = await prisma.agent.findUnique({
      where: { name: moltbookUsername },
    });

    const agentName = existingByName
      ? `${moltbookUsername}_${Date.now().toString(36)}`
      : moltbookUsername;

    agent = await prisma.agent.create({
      data: {
        name: agentName,
        apiKey,
        claimCode,
        claimedAt: new Date(), // Auto-verified via Moltbook
        twitterHandle: moltbookUsername,
        description: moltbookUserId ? `Moltbook user ${moltbookUserId}` : undefined,
      },
    });
  }

  return agent;
}

export async function GET() {
  // No auth needed - endpoint is idempotent (tracks processed posts)

  try {
    const posts = await fetchMoltbookPosts(50);
    const results: Array<{
      postId: string;
      author: string;
      success: boolean;
      pixel?: { x: number; y: number; color: string };
      error?: string;
    }> = [];

    for (const post of posts) {
      // Check if already processed
      const existing = await prisma.processedPost.findUnique({
        where: { id: post.id },
      });

      if (existing) {
        continue; // Skip already processed posts
      }

      // Extract pixel commands from post
      const commands = extractPixelCommands(post.title || '', post.content || '');

      if (commands.length === 0) {
        // No pixel command found, mark as processed anyway to not retry
        await prisma.processedPost.create({
          data: {
            id: post.id,
            authorName: post.author.name,
            authorId: post.author.id,
            content: `${post.title || ''}\n${post.content || ''}`.slice(0, 1000),
            success: false,
            errorMessage: 'No pixel command found',
          },
        });
        continue;
      }

      // Process first command only (one pixel per post)
      const cmd = commands[0];

      try {
        // Get or create agent for this user
        const agent = await getOrCreateAgent(post.author.name, post.author.id);

        // Check cooldown
        if (agent.lastPixelAt) {
          const timeSinceLastPixel = Date.now() - agent.lastPixelAt.getTime();
          if (timeSinceLastPixel < COOLDOWN_MS) {
            const remainingSeconds = Math.ceil((COOLDOWN_MS - timeSinceLastPixel) / 1000);
            throw new Error(`Rate limited. ${remainingSeconds}s remaining.`);
          }
        }

        // Place the pixel
        await setPixel(cmd.x, cmd.y, cmd.color);

        const now = new Date();

        // Record pixel placement
        await prisma.pixel.create({
          data: {
            x: cmd.x,
            y: cmd.y,
            color: cmd.color,
            agentId: agent.id,
            placedAt: now,
          },
        });

        // Update ownership
        await prisma.pixelOwnership.upsert({
          where: { x_y: { x: cmd.x, y: cmd.y } },
          create: {
            x: cmd.x,
            y: cmd.y,
            color: cmd.color,
            agentId: agent.id,
            placedAt: now,
          },
          update: {
            color: cmd.color,
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
              x: cmd.x,
              y: cmd.y,
              color: cmd.color,
              agentId: agent.id,
              agentName: agent.name,
              timestamp: now.toISOString(),
            },
          });
        } catch {
          // Don't fail if broadcast fails
        }

        // Mark post as processed successfully
        await prisma.processedPost.create({
          data: {
            id: post.id,
            authorName: post.author.name,
            authorId: post.author.id,
            content: `${post.title || ''}\n${post.content || ''}`.slice(0, 1000),
            pixelX: cmd.x,
            pixelY: cmd.y,
            pixelColor: cmd.color,
            success: true,
          },
        });

        results.push({
          postId: post.id,
          author: post.author.name,
          success: true,
          pixel: { x: cmd.x, y: cmd.y, color: COLOR_NAMES[cmd.color] },
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // Mark as processed with error
        await prisma.processedPost.create({
          data: {
            id: post.id,
            authorName: post.author.name,
            authorId: post.author.id,
            content: `${post.title || ''}\n${post.content || ''}`.slice(0, 1000),
            pixelX: cmd.x,
            pixelY: cmd.y,
            pixelColor: cmd.color,
            success: false,
            errorMessage,
          },
        });

        results.push({
          postId: post.id,
          author: post.author.name,
          success: false,
          pixel: { x: cmd.x, y: cmd.y, color: COLOR_NAMES[cmd.color] },
          error: errorMessage,
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error('Error processing Moltbook posts:', error);
    return NextResponse.json(
      { error: 'Failed to process Moltbook posts' },
      { status: 500 }
    );
  }
}
