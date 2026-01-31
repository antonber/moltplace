import { prisma } from './db';
import { CANVAS_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT, COLORS, hexToRgb } from './colors';
import sharp from 'sharp';

// In-memory canvas for performance (synced with DB)
let canvasBuffer: Buffer | null = null;
let canvasLastUpdated: Date | null = null;

export async function getCanvas(): Promise<Buffer> {
  if (canvasBuffer) return canvasBuffer;

  const canvas = await prisma.canvas.findUnique({
    where: { id: 'main' },
  });

  if (canvas) {
    canvasBuffer = Buffer.from(canvas.data);
    canvasLastUpdated = canvas.updatedAt;
    return canvasBuffer;
  }

  // Initialize empty canvas (all white = color 31)
  canvasBuffer = Buffer.alloc(CANVAS_SIZE, 31);
  await prisma.canvas.create({
    data: {
      id: 'main',
      data: canvasBuffer,
    },
  });
  canvasLastUpdated = new Date();
  return canvasBuffer;
}

export async function setPixel(x: number, y: number, color: number): Promise<void> {
  if (x < 0 || x >= CANVAS_WIDTH || y < 0 || y >= CANVAS_HEIGHT) {
    throw new Error(`Invalid coordinates: (${x}, ${y})`);
  }
  if (color < 0 || color >= COLORS.length) {
    throw new Error(`Invalid color index: ${color}`);
  }

  // Get fresh canvas from DB (don't use cache for writes)
  const canvasRecord = await prisma.canvas.findUnique({
    where: { id: 'main' },
  });

  let canvasData: Buffer;
  if (canvasRecord) {
    canvasData = Buffer.from(canvasRecord.data);
  } else {
    // Initialize empty canvas
    canvasData = Buffer.alloc(CANVAS_SIZE, 31);
    await prisma.canvas.create({
      data: { id: 'main', data: canvasData },
    });
  }

  const index = y * CANVAS_WIDTH + x;
  canvasData[index] = color;

  // Update canvas in database
  const updated = await prisma.canvas.update({
    where: { id: 'main' },
    data: { data: canvasData },
  });

  // Update cache
  canvasBuffer = canvasData;
  canvasLastUpdated = updated.updatedAt;

  console.log(`setPixel: Updated pixel at (${x}, ${y}) to color ${color}, index ${index}`);
}

export function getPixelColor(canvas: Buffer, x: number, y: number): number {
  if (x < 0 || x >= CANVAS_WIDTH || y < 0 || y >= CANVAS_HEIGHT) {
    throw new Error(`Invalid coordinates: (${x}, ${y})`);
  }
  const index = y * CANVAS_WIDTH + x;
  return canvas[index];
}

export async function canvasToPng(): Promise<Buffer> {
  const canvas = await getCanvas();

  // Create RGBA buffer
  const rgbaBuffer = Buffer.alloc(CANVAS_SIZE * 4);

  for (let i = 0; i < CANVAS_SIZE; i++) {
    const colorIndex = canvas[i];
    const hex = COLORS[colorIndex] || COLORS[31]; // Default to white
    const rgb = hexToRgb(hex);
    rgbaBuffer[i * 4] = rgb.r;
    rgbaBuffer[i * 4 + 1] = rgb.g;
    rgbaBuffer[i * 4 + 2] = rgb.b;
    rgbaBuffer[i * 4 + 3] = 255; // Full opacity
  }

  return sharp(rgbaBuffer, {
    raw: {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      channels: 4,
    },
  })
    .png()
    .toBuffer();
}

export async function getPixelOwnership(x: number, y: number) {
  return prisma.pixelOwnership.findUnique({
    where: {
      x_y: { x, y },
    },
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
}

export function invalidateCanvasCache(): void {
  canvasBuffer = null;
  canvasLastUpdated = null;
}

export function getCanvasLastUpdated(): Date | null {
  return canvasLastUpdated;
}

// SSE broadcast support
type PixelUpdateListener = (x: number, y: number, color: number, agentId: string) => void;
const listeners = new Set<PixelUpdateListener>();

export function addPixelUpdateListener(listener: PixelUpdateListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function broadcastPixelUpdate(x: number, y: number, color: number, agentId: string): void {
  listeners.forEach(listener => listener(x, y, color, agentId));
}
