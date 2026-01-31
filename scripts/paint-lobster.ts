import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Color indices from our palette
const COLORS = {
  BURGUNDY: 0,
  DARK_RED: 1,
  RED: 2,
  ORANGE: 3,
  YELLOW: 4,
  PALE_YELLOW: 5,
  DARK_GREEN: 6,
  GREEN: 7,
  LIGHT_GREEN: 8,
  DARK_BLUE: 12,
  BLUE: 13,
  LIGHT_BLUE: 14,
  DARK_PURPLE: 18,
  BLACK: 27,
  DARK_GRAY: 28,
  GRAY: 29,
  WHITE: 31,
};

// Lobster pixel art - artist lobster with beret, paintbrush and palette
// Using a simple grid where each character maps to a color
// . = transparent (skip), R = red, O = orange, B = black, etc.
const LOBSTER_ART = `
..........BBBB..........
........BBBBBBBB........
........BBBBBBBB........
.........BBBBBB.........
....OO....OOOO....OO....
...OOOO..OOOOOO..OOOO...
..OOOOOO.OOOOOO.OOOOOO..
..OOOOOOOOOOOOOOOOOOOO..
...OOOOOOOOOOOOOOOOOO...
....OOOOOOOOOOOOOOOO....
.....OOOO.OO.OOOO.......
....OOOOOOOOOOOOOOPP....
....OOOO.WWWW.OOOO......
.....OOO.WWWW.OOO.......
......OOOOOOOOOO........
.......OOOOOOOO.........
........OOOOOO..........
.......OO....OO.........
......OOO....OOO........
.....OOOO....OOOO.......
....OOOOO....OOOOO......
...OO..OO....OO..OO.....
..OO...OO....OO...OO....
.OO....OO....OO....OO...
OO.....OO....OO.....OO..
`;

// Paintbrush art (to the right of lobster's claw)
const BRUSH_ART = `
.........YY
........YYY
.......YYY.
......BBB..
.....BBB...
....BBB....
...BBB.....
..BBB......
.BBB.......
BBB........
`;

// Palette art (to the left of lobster)
const PALETTE_ART = `
...WWWWWW...
..WWWWWWWW..
.WWRRWWBBWW.
WWWWWWWWWWWW
WWGGWWWWYYWW
.WWWWWWWWWW.
..WWWWWWWW..
...WWWWWW...
`;

const colorMap: Record<string, number> = {
  'B': COLORS.BLACK,
  'O': COLORS.ORANGE,
  'R': COLORS.RED,
  'r': COLORS.DARK_RED,
  'Y': COLORS.YELLOW,
  'W': COLORS.PALE_YELLOW, // Wood/tan color for palette
  'G': COLORS.GREEN,
  'b': COLORS.BLUE,
  'P': COLORS.DARK_GRAY, // For mustache
};

function parseArt(art: string, offsetX: number, offsetY: number): Array<{x: number, y: number, color: number}> {
  const pixels: Array<{x: number, y: number, color: number}> = [];
  const lines = art.trim().split('\n');

  for (let y = 0; y < lines.length; y++) {
    for (let x = 0; x < lines[y].length; x++) {
      const char = lines[y][x];
      if (char !== '.' && colorMap[char] !== undefined) {
        pixels.push({
          x: offsetX + x,
          y: offsetY + y,
          color: colorMap[char],
        });
      }
    }
  }

  return pixels;
}

async function paintLobster() {
  console.log('Painting lobster on canvas...');

  // Center the lobster around (500, 500)
  const centerX = 500;
  const centerY = 500;

  // Parse all art pieces
  const lobsterPixels = parseArt(LOBSTER_ART, centerX - 12, centerY - 15);
  const brushPixels = parseArt(BRUSH_ART, centerX + 15, centerY - 5);
  const palettePixels = parseArt(PALETTE_ART, centerX - 28, centerY + 5);

  const allPixels = [...lobsterPixels, ...brushPixels, ...palettePixels];

  console.log(`Total pixels to paint: ${allPixels.length}`);

  // Get or create canvas
  const CANVAS_SIZE = 1000 * 1000;
  let canvasRecord = await prisma.canvas.findUnique({ where: { id: 'main' } });

  let canvasData: Buffer;
  if (canvasRecord) {
    canvasData = Buffer.from(canvasRecord.data);
  } else {
    canvasData = Buffer.alloc(CANVAS_SIZE, 31); // White background
    await prisma.canvas.create({ data: { id: 'main', data: canvasData } });
  }

  // Paint all pixels
  for (const pixel of allPixels) {
    const index = pixel.y * 1000 + pixel.x;
    if (index >= 0 && index < CANVAS_SIZE) {
      canvasData[index] = pixel.color;
    }
  }

  // Save canvas
  await prisma.canvas.update({
    where: { id: 'main' },
    data: { data: canvasData },
  });

  // Also create pixel ownership records (owned by system)
  // First, create a system agent if it doesn't exist
  let systemAgent = await prisma.agent.findFirst({ where: { name: 'MoltplaceBot' } });
  if (!systemAgent) {
    systemAgent = await prisma.agent.create({
      data: {
        name: 'MoltplaceBot',
        apiKey: 'system_' + Math.random().toString(36).slice(2),
        claimCode: 'system',
        claimedAt: new Date(),
        description: 'Official Moltplace bot for initial artwork',
      },
    });
  }

  const now = new Date();

  // Upsert pixel ownerships
  for (const pixel of allPixels) {
    await prisma.pixelOwnership.upsert({
      where: { x_y: { x: pixel.x, y: pixel.y } },
      create: {
        x: pixel.x,
        y: pixel.y,
        color: pixel.color,
        agentId: systemAgent.id,
        placedAt: now,
      },
      update: {
        color: pixel.color,
        agentId: systemAgent.id,
        placedAt: now,
      },
    });
  }

  console.log('Lobster painted successfully!');
}

paintLobster()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
