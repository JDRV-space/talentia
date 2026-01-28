/**
 * API endpoint to generate presigned URLs for R2 uploads
 * POST /api/r2/presign
 */

import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getR2Client, R2_BUCKET } from '@/lib/r2/client';
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth';
import { generateStoragePath } from '@/lib/r2/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PresignRequest {
  fileName: string;
  fileType: string;
  fileSize?: number;
}

export async function POST(request: NextRequest) {
  const { user } = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  try {
    const body: PresignRequest = await request.json();
    const { fileName, fileType, fileSize } = body;

    if (!fileName || !fileType) {
      return NextResponse.json(
        { error: 'fileName y fileType son requeridos' },
        { status: 400 }
      );
    }

    // Validate file size (200MB max)
    const MAX_SIZE = 200 * 1024 * 1024;
    if (fileSize && fileSize > MAX_SIZE) {
      return NextResponse.json(
        { error: 'El archivo excede el tamano maximo de 200MB' },
        { status: 400 }
      );
    }

    const key = generateStoragePath(fileName);

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: fileType,
    });

    // 15-minute expiry for large file uploads
    const url = await getSignedUrl(getR2Client(), command, { expiresIn: 900 });

    return NextResponse.json({ url, key });
  } catch (error) {
    return NextResponse.json(
      { error: 'Error al generar URL de subida' },
      { status: 500 }
    );
  }
}
