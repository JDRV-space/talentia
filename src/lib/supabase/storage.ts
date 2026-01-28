/**
 * Supabase Storage utilities for large file uploads
 *
 * This module provides browser-side upload functionality to Supabase Storage,
 * bypassing Vercel's 4.5MB body size limit for serverless functions.
 *
 * Flow:
 * 1. Browser uploads file directly to Supabase Storage (no size limit)
 * 2. API receives just the storage path (small JSON payload)
 * 3. API downloads file from storage and processes it
 */

import { createClient } from './client';

const BUCKET_NAME = 'excel-uploads';

/**
 * Generates a unique storage path for an upload
 * Format: {timestamp}_{random}_{filename}
 */
export function generateStoragePath(fileName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${timestamp}_${random}_${sanitizedName}`;
}

/**
 * Uploads a file directly to Supabase Storage from the browser
 * Returns the storage path on success
 */
export async function uploadToStorage(file: File): Promise<{
  success: boolean;
  path?: string;
  error?: string;
}> {
  try {
    const supabase = createClient();
    const storagePath = generateStoragePath(file.name);

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      return {
        success: false,
        error: error.message || 'Error al subir archivo a storage',
      };
    }

    return {
      success: true,
      path: data.path,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al subir archivo',
    };
  }
}

/**
 * Deletes a file from Supabase Storage
 * Used for cleanup after processing
 */
export async function deleteFromStorage(path: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const supabase = createClient();

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([path]);

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al eliminar archivo',
    };
  }
}

/**
 * Gets a signed URL for downloading a file (used server-side)
 * Valid for 1 hour
 */
export async function getSignedUrl(path: string): Promise<{
  success: boolean;
  url?: string;
  error?: string;
}> {
  try {
    const supabase = createClient();

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(path, 3600); // 1 hour expiry

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      url: data.signedUrl,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al obtener URL',
    };
  }
}
