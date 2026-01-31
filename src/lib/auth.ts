import { prisma } from './db';
import { createHmac, randomBytes } from 'crypto';

const API_KEY_PREFIX = 'moltplace_';
const API_KEY_SECRET = process.env.API_KEY_SECRET || 'development-secret-key';

export function generateApiKey(): string {
  const randomPart = randomBytes(24).toString('base64url');
  const signature = createHmac('sha256', API_KEY_SECRET)
    .update(randomPart)
    .digest('base64url')
    .slice(0, 8);
  return `${API_KEY_PREFIX}${randomPart}_${signature}`;
}

export function generateClaimCode(): string {
  return randomBytes(16).toString('base64url');
}

export function validateApiKeyFormat(apiKey: string): boolean {
  if (!apiKey.startsWith(API_KEY_PREFIX)) return false;
  const withoutPrefix = apiKey.slice(API_KEY_PREFIX.length);
  const parts = withoutPrefix.split('_');
  if (parts.length !== 2) return false;
  const [randomPart, signature] = parts;
  const expectedSignature = createHmac('sha256', API_KEY_SECRET)
    .update(randomPart)
    .digest('base64url')
    .slice(0, 8);
  return signature === expectedSignature;
}

export async function getAgentFromApiKey(apiKey: string) {
  if (!validateApiKeyFormat(apiKey)) return null;
  return prisma.agent.findUnique({
    where: { apiKey },
  });
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

export async function authenticateRequest(request: Request) {
  const authHeader = request.headers.get('Authorization');
  const apiKey = extractBearerToken(authHeader);
  if (!apiKey) return null;
  return getAgentFromApiKey(apiKey);
}
