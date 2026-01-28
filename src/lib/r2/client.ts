/**
 * Cloudflare R2 Client Configuration
 *
 * S3-compatible client for R2 storage.
 * Used for large file uploads that exceed Supabase's 50MB free tier limit.
 *
 * Required env vars:
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_ACCESS_KEY_ID
 *   CLOUDFLARE_SECRET_ACCESS_KEY
 *   R2_BUCKET_NAME
 */

import { S3Client } from '@aws-sdk/client-s3';

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.CLOUDFLARE_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.CLOUDFLARE_SECRET_ACCESS_KEY;

// Lazy initialization to avoid errors during build
let _r2Client: S3Client | null = null;

/**
 * Get R2 client (lazy initialized)
 * Throws if credentials are missing
 */
export function getR2Client(): S3Client {
  if (_r2Client) return _r2Client;

  if (!ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
    throw new Error(
      '[R2] Missing Cloudflare R2 credentials. Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_ACCESS_KEY_ID, and CLOUDFLARE_SECRET_ACCESS_KEY'
    );
  }

  _r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
    },
  });

  return _r2Client;
}

// Legacy export for backwards compatibility (lazy getter)
export const r2 = {
  send: async (command: Parameters<S3Client['send']>[0]) => {
    return getR2Client().send(command);
  },
};

export const R2_BUCKET = process.env.R2_BUCKET_NAME || 'excel-uploads';
