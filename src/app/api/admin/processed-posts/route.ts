import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET - View processed posts (with optional filter for failures)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const failedOnly = searchParams.get('failed') === 'true';
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);

  const posts = await prisma.processedPost.findMany({
    where: failedOnly ? { success: false } : undefined,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return NextResponse.json({
    count: posts.length,
    posts: posts.map(p => ({
      id: p.id,
      authorName: p.authorName,
      success: p.success,
      errorMessage: p.errorMessage,
      pixel: p.pixelX !== null ? { x: p.pixelX, y: p.pixelY, color: p.pixelColor } : null,
      createdAt: p.createdAt,
    })),
  });
}

// DELETE - Clear failed processed posts so they can be retried
export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const postId = searchParams.get('id');
  const clearAllFailed = searchParams.get('clearAllFailed') === 'true';

  if (postId) {
    // Delete specific post
    await prisma.processedPost.delete({
      where: { id: postId },
    });
    return NextResponse.json({ success: true, deleted: 1, message: `Cleared post ${postId}` });
  }

  if (clearAllFailed) {
    // Delete all failed posts
    const result = await prisma.processedPost.deleteMany({
      where: { success: false },
    });
    return NextResponse.json({
      success: true,
      deleted: result.count,
      message: `Cleared ${result.count} failed posts - they will be retried on next cron run`
    });
  }

  return NextResponse.json(
    { error: 'Provide ?id=<postId> or ?clearAllFailed=true' },
    { status: 400 }
  );
}
