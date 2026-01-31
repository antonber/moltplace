import { addPixelUpdateListener } from '@/lib/canvas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      controller.enqueue(encoder.encode('event: connected\ndata: {"status":"connected"}\n\n'));

      // Set up heartbeat
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30000);

      // Subscribe to pixel updates
      const unsubscribe = addPixelUpdateListener((x, y, color, agentId) => {
        try {
          const data = JSON.stringify({ x, y, color, agentId, timestamp: new Date().toISOString() });
          controller.enqueue(encoder.encode(`event: pixel\ndata: ${data}\n\n`));
        } catch {
          // Stream closed
        }
      });

      // Cleanup on abort
      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };

      // Return cleanup function for when stream closes
      return cleanup;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
