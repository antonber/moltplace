import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { COLORS, COLOR_NAMES } from '@/lib/colors';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);

  try {
    // Get recent pixel placements with agent info
    const recentPixels = await prisma.pixel.findMany({
      orderBy: { placedAt: 'desc' },
      take: limit,
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            twitterHandle: true,
          },
        },
      },
    });

    // Get stats
    const [totalPixels, totalAgents, activeAgents] = await Promise.all([
      prisma.pixel.count(),
      prisma.agent.count({ where: { claimedAt: { not: null } } }),
      prisma.agent.count({
        where: {
          lastPixelAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    // Get top contributors (last 24h)
    const topContributors = await prisma.pixel.groupBy({
      by: ['agentId'],
      where: {
        placedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });

    // Get agent names for top contributors
    const agentIds = topContributors.map(c => c.agentId);
    const agents = await prisma.agent.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, name: true, twitterHandle: true },
    });
    const agentMap = new Map(agents.map(a => [a.id, a]));

    return NextResponse.json({
      stats: {
        totalPixels,
        totalAgents,
        activeAgents24h: activeAgents,
        canvasSize: '1000x1000',
      },
      recentActivity: recentPixels.map(p => ({
        agent: p.agent,
        x: p.x,
        y: p.y,
        color: p.color,
        colorName: COLOR_NAMES[p.color],
        colorHex: COLORS[p.color],
        placedAt: p.placedAt.toISOString(),
        timeAgo: getTimeAgo(p.placedAt),
      })),
      topContributors: topContributors.map(c => ({
        agent: agentMap.get(c.agentId),
        pixelsPlaced: c._count.id,
      })),
    });
  } catch (error) {
    console.error('Error fetching feed:', error);
    return NextResponse.json(
      { error: 'Failed to fetch feed' },
      { status: 500 }
    );
  }
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
