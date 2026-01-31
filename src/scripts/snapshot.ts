/**
 * Snapshot Script
 *
 * This script captures a PNG snapshot of the current canvas and uploads it to R2.
 * Run this as a cron job every 5 minutes:
 *
 *   npx ts-node src/scripts/snapshot.ts
 *
 * Or schedule via Vercel Cron or similar service.
 */

import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

// Configuration
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 1000;

const COLORS = [
  '#6D001A', '#BE0039', '#FF4500', '#FFA800', '#FFD635', '#FFF8B8',
  '#00A368', '#00CC78', '#7EED56', '#00756F', '#009EAA', '#00CCC0',
  '#2450A4', '#3690EA', '#51E9F4', '#493AC1', '#6A5CFF', '#94B3FF',
  '#811E9F', '#B44AC0', '#E4ABFF', '#DE107F', '#FF3881', '#FF99AA',
  '#6D482F', '#9C6926', '#FFB470', '#000000', '#515252', '#898D90',
  '#D4D7D9', '#FFFFFF'
];

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) throw new Error(`Invalid hex color: ${hex}`);
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

async function main() {
  console.log('Starting snapshot...');
  const startTime = Date.now();

  // Initialize Prisma
  const prisma = new PrismaClient();

  // Initialize R2
  const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

  try {
    // Fetch current canvas
    const canvas = await prisma.canvas.findUnique({
      where: { id: 'main' },
    });

    if (!canvas) {
      console.log('No canvas found, skipping snapshot');
      return;
    }

    const canvasData = Buffer.from(canvas.data);
    console.log(`Canvas loaded: ${canvasData.length} bytes`);

    // Convert to PNG
    const rgbaBuffer = Buffer.alloc(CANVAS_WIDTH * CANVAS_HEIGHT * 4);
    for (let i = 0; i < canvasData.length; i++) {
      const colorIndex = canvasData[i];
      const hex = COLORS[colorIndex] || COLORS[31];
      const rgb = hexToRgb(hex);
      rgbaBuffer[i * 4] = rgb.r;
      rgbaBuffer[i * 4 + 1] = rgb.g;
      rgbaBuffer[i * 4 + 2] = rgb.b;
      rgbaBuffer[i * 4 + 3] = 255;
    }

    const pngBuffer = await sharp(rgbaBuffer, {
      raw: {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        channels: 4,
      },
    })
      .png()
      .toBuffer();

    console.log(`PNG generated: ${pngBuffer.length} bytes`);

    // Upload to R2
    const timestamp = new Date();
    const s3Key = `snapshots/${timestamp.toISOString().replace(/[:.]/g, '-')}.png`;

    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME || 'moltplace-snapshots',
      Key: s3Key,
      Body: pngBuffer,
      ContentType: 'image/png',
    }));

    console.log(`Uploaded to R2: ${s3Key}`);

    // Record snapshot in database
    const snapshot = await prisma.snapshot.create({
      data: {
        timestamp,
        s3Key,
      },
    });

    console.log(`Snapshot recorded: ${snapshot.id}`);

    const elapsed = Date.now() - startTime;
    console.log(`Snapshot completed in ${elapsed}ms`);

  } catch (error) {
    console.error('Snapshot failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
