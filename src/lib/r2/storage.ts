/**
 * R2 Storage utilities for large file uploads
 */

export function generateStoragePath(fileName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return timestamp + '_' + random + '_' + sanitizedName;
}

export async function uploadToR2(file: File): Promise<{
  success: boolean;
  key?: string;
  error?: string;
}> {
  try {
    const presignResponse = await fetch('/api/r2/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
      }),
    });

    if (!presignResponse.ok) {
      const errorData = await presignResponse.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.error || 'Error al obtener URL de subida',
      };
    }

    const { url, key } = await presignResponse.json();

    const uploadResponse = await fetch(url, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
      },
    });

    if (!uploadResponse.ok) {
      return {
        success: false,
        error: 'Error al subir archivo: ' + uploadResponse.statusText,
      };
    }

    return { success: true, key };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado',
    };
  }
}
