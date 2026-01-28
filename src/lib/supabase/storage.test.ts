/**
 * Unit tests for Supabase Storage utilities
 * Tests browser-side upload functionality for large file handling
 *
 * @coverage Target: 80%+ for storage.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateStoragePath, uploadToStorage, deleteFromStorage, getSignedUrl } from './storage';

// =============================================================================
// MOCKS
// =============================================================================

// Mock the createClient function
vi.mock('./client', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}));

// Mock Supabase client with storage methods
const mockStorageUpload = vi.fn();
const mockStorageRemove = vi.fn();
const mockStorageCreateSignedUrl = vi.fn();

const mockSupabaseClient = {
  storage: {
    from: vi.fn(() => ({
      upload: mockStorageUpload,
      remove: mockStorageRemove,
      createSignedUrl: mockStorageCreateSignedUrl,
    })),
  },
};

// =============================================================================
// generateStoragePath TESTS
// =============================================================================

describe('generateStoragePath', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-10T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should generate path with timestamp prefix', () => {
    const path = generateStoragePath('test.xlsx');
    // Timestamp should be a 13-digit number at the start
    expect(path).toMatch(/^\d{13}_/);
    // Verify the timestamp is reasonable (within last 10 years to next 10 years)
    const timestamp = parseInt(path.split('_')[0], 10);
    const now = Date.now();
    expect(timestamp).toBeGreaterThan(now - 10 * 365 * 24 * 60 * 60 * 1000);
    expect(timestamp).toBeLessThan(now + 10 * 365 * 24 * 60 * 60 * 1000);
  });

  it('should include random string component', () => {
    const path1 = generateStoragePath('test.xlsx');
    const path2 = generateStoragePath('test.xlsx');
    // Random component should be 6 chars after timestamp_
    const random1 = path1.split('_')[1];
    const random2 = path2.split('_')[1];
    expect(random1).toHaveLength(6);
    expect(random2).toHaveLength(6);
  });

  it('should sanitize special characters in filename', () => {
    const path = generateStoragePath('Archivo Con Espacios & Simbolos!.xlsx');
    expect(path).toContain('Archivo_Con_Espacios___Simbolos_.xlsx');
    expect(path).not.toContain(' ');
    expect(path).not.toContain('&');
    expect(path).not.toContain('!');
  });

  it('should preserve allowed characters in filename', () => {
    const path = generateStoragePath('valid-file_name.2026.xlsx');
    expect(path).toContain('valid-file_name.2026.xlsx');
  });

  it('should handle empty filename', () => {
    const path = generateStoragePath('');
    expect(path).toMatch(/^\d+_[a-z0-9]+_$/);
  });

  it('should handle filename with only special characters', () => {
    const path = generateStoragePath('!!!@@@###');
    expect(path).toMatch(/^\d+_[a-z0-9]+_+$/);
  });

  it('should handle unicode characters in filename', () => {
    const path = generateStoragePath('archivo_espanol.xlsx');
    expect(path).toContain('archivo_espanol.xlsx');
  });
});

// =============================================================================
// uploadToStorage TESTS
// =============================================================================

describe('uploadToStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should upload file successfully and return path', async () => {
    const mockFile = new File(['test content'], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    mockStorageUpload.mockResolvedValue({
      data: { path: 'uploaded/path/test.xlsx' },
      error: null,
    });

    const result = await uploadToStorage(mockFile);

    expect(result.success).toBe(true);
    expect(result.path).toBe('uploaded/path/test.xlsx');
    expect(result.error).toBeUndefined();
    expect(mockSupabaseClient.storage.from).toHaveBeenCalledWith('excel-uploads');
    expect(mockStorageUpload).toHaveBeenCalledWith(
      expect.any(String),
      mockFile,
      { cacheControl: '3600', upsert: false }
    );
  });

  it('should handle Supabase upload error', async () => {
    const mockFile = new File(['test content'], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    mockStorageUpload.mockResolvedValue({
      data: null,
      error: { message: 'Storage quota exceeded' },
    });

    const result = await uploadToStorage(mockFile);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Storage quota exceeded');
    expect(result.path).toBeUndefined();
  });

  it('should handle Supabase error without message', async () => {
    const mockFile = new File(['test content'], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    mockStorageUpload.mockResolvedValue({
      data: null,
      error: {},
    });

    const result = await uploadToStorage(mockFile);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Error al subir archivo a storage');
  });

  it('should handle unexpected exceptions during upload', async () => {
    const mockFile = new File(['test content'], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    mockStorageUpload.mockRejectedValue(new Error('Network error'));

    const result = await uploadToStorage(mockFile);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error');
  });

  it('should handle non-Error exceptions during upload', async () => {
    const mockFile = new File(['test content'], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    mockStorageUpload.mockRejectedValue('Unknown error string');

    const result = await uploadToStorage(mockFile);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Error inesperado al subir archivo');
  });

  it('should use correct bucket name', async () => {
    const mockFile = new File(['test'], 'test.xlsx');

    mockStorageUpload.mockResolvedValue({
      data: { path: 'test.xlsx' },
      error: null,
    });

    await uploadToStorage(mockFile);

    expect(mockSupabaseClient.storage.from).toHaveBeenCalledWith('excel-uploads');
  });

  it('should set upsert to false (no overwriting)', async () => {
    const mockFile = new File(['test'], 'test.xlsx');

    mockStorageUpload.mockResolvedValue({
      data: { path: 'test.xlsx' },
      error: null,
    });

    await uploadToStorage(mockFile);

    expect(mockStorageUpload).toHaveBeenCalledWith(
      expect.any(String),
      mockFile,
      expect.objectContaining({ upsert: false })
    );
  });
});

// =============================================================================
// deleteFromStorage TESTS
// =============================================================================

describe('deleteFromStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should delete file successfully', async () => {
    mockStorageRemove.mockResolvedValue({
      data: [{ name: 'test.xlsx' }],
      error: null,
    });

    const result = await deleteFromStorage('path/to/test.xlsx');

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(mockStorageRemove).toHaveBeenCalledWith(['path/to/test.xlsx']);
  });

  it('should handle Supabase delete error', async () => {
    mockStorageRemove.mockResolvedValue({
      data: null,
      error: { message: 'File not found' },
    });

    const result = await deleteFromStorage('nonexistent.xlsx');

    expect(result.success).toBe(false);
    expect(result.error).toBe('File not found');
  });

  it('should handle unexpected exceptions during delete', async () => {
    mockStorageRemove.mockRejectedValue(new Error('Connection lost'));

    const result = await deleteFromStorage('test.xlsx');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Connection lost');
  });

  it('should handle non-Error exceptions during delete', async () => {
    mockStorageRemove.mockRejectedValue({ code: 'UNKNOWN' });

    const result = await deleteFromStorage('test.xlsx');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Error inesperado al eliminar archivo');
  });

  it('should use correct bucket name for delete', async () => {
    mockStorageRemove.mockResolvedValue({ data: [], error: null });

    await deleteFromStorage('test.xlsx');

    expect(mockSupabaseClient.storage.from).toHaveBeenCalledWith('excel-uploads');
  });
});

// =============================================================================
// getSignedUrl TESTS
// =============================================================================

describe('getSignedUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate signed URL successfully', async () => {
    mockStorageCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.supabase.co/signed/test.xlsx?token=abc123' },
      error: null,
    });

    const result = await getSignedUrl('path/to/test.xlsx');

    expect(result.success).toBe(true);
    expect(result.url).toBe('https://storage.supabase.co/signed/test.xlsx?token=abc123');
    expect(result.error).toBeUndefined();
  });

  it('should request 1 hour expiry for signed URL', async () => {
    mockStorageCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.com/signed' },
      error: null,
    });

    await getSignedUrl('test.xlsx');

    expect(mockStorageCreateSignedUrl).toHaveBeenCalledWith('test.xlsx', 3600);
  });

  it('should handle Supabase signed URL error', async () => {
    mockStorageCreateSignedUrl.mockResolvedValue({
      data: null,
      error: { message: 'Access denied' },
    });

    const result = await getSignedUrl('restricted.xlsx');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Access denied');
    expect(result.url).toBeUndefined();
  });

  it('should handle unexpected exceptions during signed URL generation', async () => {
    mockStorageCreateSignedUrl.mockRejectedValue(new Error('Token generation failed'));

    const result = await getSignedUrl('test.xlsx');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Token generation failed');
  });

  it('should handle non-Error exceptions during signed URL generation', async () => {
    mockStorageCreateSignedUrl.mockRejectedValue(null);

    const result = await getSignedUrl('test.xlsx');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Error inesperado al obtener URL');
  });

  it('should use correct bucket name for signed URL', async () => {
    mockStorageCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.com' },
      error: null,
    });

    await getSignedUrl('test.xlsx');

    expect(mockSupabaseClient.storage.from).toHaveBeenCalledWith('excel-uploads');
  });
});

// =============================================================================
// EDGE CASES & BOUNDARY TESTS
// =============================================================================

describe('Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle large file names (255 char limit)', async () => {
    const longName = 'a'.repeat(250) + '.xlsx';
    const path = generateStoragePath(longName);
    expect(path.length).toBeGreaterThan(250);
    expect(path).toContain('.xlsx');
  });

  it('should handle file with no extension', async () => {
    const path = generateStoragePath('noextension');
    expect(path).toContain('noextension');
  });

  it('should handle file with multiple dots', async () => {
    const path = generateStoragePath('file.backup.2026.xlsx');
    expect(path).toContain('file.backup.2026.xlsx');
  });

  it('should handle path with slashes being sanitized', async () => {
    const path = generateStoragePath('path/to/file.xlsx');
    // Slashes should be sanitized to underscores
    expect(path).not.toContain('/');
    expect(path).toContain('path_to_file.xlsx');
  });
});

// =============================================================================
// CONCURRENT OPERATIONS TESTS
// =============================================================================

describe('Concurrent Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate unique paths for concurrent uploads', () => {
    const paths = new Set<string>();
    for (let i = 0; i < 100; i++) {
      paths.add(generateStoragePath('test.xlsx'));
    }
    // All paths should be unique due to random component
    expect(paths.size).toBe(100);
  });

  it('should handle concurrent upload requests', async () => {
    const mockFile1 = new File(['content1'], 'file1.xlsx');
    const mockFile2 = new File(['content2'], 'file2.xlsx');

    mockStorageUpload
      .mockResolvedValueOnce({ data: { path: 'path1.xlsx' }, error: null })
      .mockResolvedValueOnce({ data: { path: 'path2.xlsx' }, error: null });

    const [result1, result2] = await Promise.all([
      uploadToStorage(mockFile1),
      uploadToStorage(mockFile2),
    ]);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    expect(result1.path).not.toBe(result2.path);
  });
});
