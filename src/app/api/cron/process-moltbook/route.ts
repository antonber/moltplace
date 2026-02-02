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
  comment_count: number;
  author: {
    id: string;
    name: string;
  };
  created_at: string;
}

interface MoltbookComment {
  id: string;
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

interface MoltbookCommentsResponse {
  success: boolean;
  comments: MoltbookComment[];
}

async function fetchPostComments(postId: string): Promise<MoltbookComment[]> {
  try {
    const response = await fetch(`${MOLTBOOK_API}/${postId}/comments`, {
      headers: {
        'User-Agent': 'MoltplaceBot/1.0',
      },
    });

    if (!response.ok) {
      return [];
    }

    const data: MoltbookCommentsResponse = await response.json();
    return data.comments || [];
  } catch {
    return [];
  }
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

// Process a single item (post or comment) and return the result
async function processItem(
  id: string,
  title: string,
  content: string,
  authorName: string,
  authorId: string,
  isComment: boolean
): Promise<{
  id: string;
  author: string;
  success: boolean;
  pixel?: { x: number; y: number; color: string };
  error?: string;
} | null> {
  // Use prefix for comments to distinguish from posts
  const processedId = isComment ? `comment:${id}` : id;

  // Check if already processed
  const existing = await prisma.processedPost.findUnique({
    where: { id: processedId },
  });

  if (existing) {
    return null; // Skip already processed
  }

  // Extract pixel commands
  const commands = extractPixelCommands(title, content);

  if (commands.length === 0) {
    // No pixel command found, mark as processed anyway
    await prisma.processedPost.create({
      data: {
        id: processedId,
        authorName,
        authorId,
        content: `${title}\n${content}`.slice(0, 1000),
        success: false,
        errorMessage: 'No pixel command found',
      },
    });
    return null;
  }

  // Process first command only (one pixel per post/comment)
  const cmd = commands[0];

  try {
    // Get or create agent for this user
    const agent = await getOrCreateAgent(authorName, authorId);

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

    // Mark as processed successfully
    await prisma.processedPost.create({
      data: {
        id: processedId,
        authorName,
        authorId,
        content: `${title}\n${content}`.slice(0, 1000),
        pixelX: cmd.x,
        pixelY: cmd.y,
        pixelColor: cmd.color,
        success: true,
      },
    });

    return {
      id: processedId,
      author: authorName,
      success: true,
      pixel: { x: cmd.x, y: cmd.y, color: COLOR_NAMES[cmd.color] },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Mark as processed with error
    await prisma.processedPost.create({
      data: {
        id: processedId,
        authorName,
        authorId,
        content: `${title}\n${content}`.slice(0, 1000),
        pixelX: cmd.x,
        pixelY: cmd.y,
        pixelColor: cmd.color,
        success: false,
        errorMessage,
      },
    });

    return {
      id: processedId,
      author: authorName,
      success: false,
      pixel: { x: cmd.x, y: cmd.y, color: COLOR_NAMES[cmd.color] },
      error: errorMessage,
    };
  }
}

export async function GET() {
  // No auth needed - endpoint is idempotent (tracks processed posts)

  try {
    const posts = await fetchMoltbookPosts(50);
    const results: Array<{
      id: string;
      author: string;
      success: boolean;
      pixel?: { x: number; y: number; color: string };
      error?: string;
    }> = [];

    for (const post of posts) {
      // Process the post itself
      const postResult = await processItem(
        post.id,
        post.title || '',
        post.content || '',
        post.author.name,
        post.author.id,
        false
      );
      if (postResult) {
        results.push(postResult);
      }

      // Process comments if the post has any
      if (post.comment_count > 0) {
        const comments = await fetchPostComments(post.id);
        for (const comment of comments) {
          const commentResult = await processItem(
            comment.id,
            '', // Comments don't have titles
            comment.content || '',
            comment.author.name,
            comment.author.id,
            true
          );
          if (commentResult) {
            results.push(commentResult);
          }
        }
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
