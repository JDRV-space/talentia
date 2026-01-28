/**
 * Integration tests for upload-from-storage API route
 *
 * Tests the flow:
 * 1. Receive storage path in request body
 * 2. Download file from Supabase Storage
 * 3. Process using Excel parsing logic
 * 4. Delete file from storage (cleanup)
 * 5. Return results
 *
 * Note: Full database sync tests require a test database or more extensive mocking.
 * These tests focus on:
 * - Authentication flow
 * - Rate limiting
 * - Input validation
 * - Storage download/cleanup
 * - Error handling
 *
 * @coverage Target: 60%+ integration coverage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// MOCKS - Must be defined before imports
// =============================================================================

// Mock Next.js request/response
vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((body, init) => ({
      json: async () => body,
      status: init?.status || 200,
      headers: new Headers(init?.headers),
    })),
  },
}));

// Mock crypto for audit ID
vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => 'test-audit-uuid-12345'),
}));

// Mock auth
const mockUser = { id: 'user-123', email: 'test@example.com' };
const mockGetAuthenticatedUser = vi.fn(() => Promise.resolve({ user: mockUser, error: null }));
const mockUnauthorizedResponse = vi.fn(() => ({
  json: async () => ({ success: false, error: 'No autorizado' }),
  status: 401,
}));

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUser: () => mockGetAuthenticatedUser(),
  unauthorizedResponse: () => mockUnauthorizedResponse(),
}));

// Mock rate limiting
const mockCheckRateLimit = vi.fn(() => ({
  success: true,
  limit: 5,
  remaining: 4,
  reset: Date.now() + 60000,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIP: vi.fn(() => '127.0.0.1'),
  RATE_LIMITS: { strict: { limit: 5, windowSec: 60 } },
  rateLimitHeaders: vi.fn(() => ({})),
}));

// Mock Supabase storage
const mockStorageDownload = vi.fn();
const mockStorageRemove = vi.fn();

// Create a mock that handles all the Supabase patterns
const createSupabaseChainMock = () => {
  const chainMock: Record<string, unknown> = {};

  // Methods that return the chain for further chaining
  const chainMethods = ['select', 'eq', 'is', 'gte', 'lte', 'gt', 'single', 'update', 'delete'];
  chainMethods.forEach((method) => {
    chainMock[method] = vi.fn(() => chainMock);
  });

  // Methods that resolve
  chainMock.insert = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn(() => Promise.resolve({ data: { id: 'new-id' }, error: null })),
    })),
    then: (resolve: (val: unknown) => void) => resolve({ data: null, error: null }),
  }));

  // Make it thenable so await works
  chainMock.then = (resolve: (val: unknown) => void) => resolve({ data: [], error: null, count: 0 });

  return chainMock;
};

const mockSupabaseClient = {
  storage: {
    from: vi.fn(() => ({
      download: mockStorageDownload,
      remove: mockStorageRemove,
    })),
  },
  from: vi.fn(() => createSupabaseChainMock()),
  rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
  auth: {
    getUser: vi.fn(() => Promise.resolve({ data: { user: mockUser }, error: null })),
  },
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabaseClient)),
  createServiceRoleClient: vi.fn(() => mockSupabaseClient),
}));

// Mock Excel parser
const mockDetectFileType = vi.fn();
const mockParseConsolidadoReal = vi.fn();
const mockParsePicosReal = vi.fn();

vi.mock('@/lib/excel/real-parser', () => ({
  detectFileType: (...args: unknown[]) => mockDetectFileType(...args),
  parseConsolidadoReal: (...args: unknown[]) => mockParseConsolidadoReal(...args),
  parsePicosReal: (...args: unknown[]) => mockParsePicosReal(...args),
}));

// Mock dedup algorithms
vi.mock('@/lib/algorithms/dedup', () => ({
  findDuplicates: vi.fn(() => []),
  toSpanishPhonetic: vi.fn((name: string) => name.toLowerCase()),
}));

// Mock labor ratio algorithms
vi.mock('@/lib/algorithms', () => ({
  calculateHistoricalLaborRatios: vi.fn(() => null),
  getLaborRatio: vi.fn(() => ({ kg_per_worker_day: 50 })),
}));

// Mock constants
vi.mock('@/types/constants', () => ({
  DEDUP_THRESHOLDS: { review_threshold: 0.8 },
  CROP_TYPES: {
    esparrago: { kg_per_worker_day: 50 },
    arandano: { kg_per_worker_day: 30 },
  },
}));

// =============================================================================
// TEST HELPERS
// =============================================================================

function createMockRequest(body: unknown): Request {
  return {
    json: () => Promise.resolve(body),
    headers: new Headers({
      'content-type': 'application/json',
      'x-forwarded-for': '127.0.0.1',
    }),
  } as unknown as Request;
}

function createMockBlob(content: string): Blob {
  return new Blob([content], { type: 'application/octet-stream' });
}

// =============================================================================
// TESTS
// =============================================================================

describe('POST /api/upload-from-storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset to defaults
    mockGetAuthenticatedUser.mockResolvedValue({ user: mockUser, error: null });
    mockCheckRateLimit.mockReturnValue({
      success: true,
      limit: 5,
      remaining: 4,
      reset: Date.now() + 60000,
    });
    mockStorageDownload.mockResolvedValue({ data: null, error: null });
    mockStorageRemove.mockResolvedValue({ error: null });
    mockDetectFileType.mockResolvedValue('UNKNOWN');
    mockParseConsolidadoReal.mockResolvedValue({
      success: true,
      data: [],
      metadata: { totalRows: 0, extractedDate: null, dateSource: 'unknown' },
      errors: [],
    });
    mockParsePicosReal.mockResolvedValue({
      success: true,
      data: [],
      metadata: { totalRows: 0, extractedDate: null, dateSource: 'unknown' },
      errors: [],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should return 401 when user is not authenticated', async () => {
      mockGetAuthenticatedUser.mockResolvedValue({ user: null, error: 'No autorizado' });

      const { POST } = await import('./route');
      const request = createMockRequest({ storagePath: 'test.xlsx', fileName: 'test.xlsx' });

      const response = await POST(request as never);

      expect(response.status).toBe(401);
    });

    it('should proceed when user is authenticated', async () => {
      mockGetAuthenticatedUser.mockResolvedValue({ user: mockUser, error: null });
      mockStorageDownload.mockResolvedValue({
        data: null,
        error: { message: 'File not found' },
      });

      const { POST } = await import('./route');
      const request = createMockRequest({ storagePath: 'test.xlsx', fileName: 'test.xlsx' });

      const response = await POST(request as never);

      // Should get past auth (will fail at storage download)
      expect(response.status).toBe(404);
    });
  });

  describe('Rate Limiting', () => {
    it('should return 429 when rate limit exceeded', async () => {
      mockCheckRateLimit.mockReturnValue({
        success: false,
        limit: 5,
        remaining: 0,
        reset: Date.now() + 60000,
      });

      const { POST } = await import('./route');
      const request = createMockRequest({ storagePath: 'test.xlsx', fileName: 'test.xlsx' });

      const response = await POST(request as never);
      const body = await response.json();

      expect(response.status).toBe(429);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Demasiadas solicitudes');
    });

    it('should proceed when rate limit not exceeded', async () => {
      mockCheckRateLimit.mockReturnValue({
        success: true,
        limit: 5,
        remaining: 4,
        reset: Date.now() + 60000,
      });
      mockStorageDownload.mockResolvedValue({
        data: null,
        error: { message: 'File not found' },
      });

      const { POST } = await import('./route');
      const request = createMockRequest({ storagePath: 'test.xlsx', fileName: 'test.xlsx' });

      const response = await POST(request as never);

      // Should get past rate limit (will fail at storage)
      expect(response.status).toBe(404);
    });
  });

  describe('Input Validation', () => {
    it('should return 400 when storagePath is missing', async () => {
      const { POST } = await import('./route');
      const request = createMockRequest({ fileName: 'test.xlsx' });

      const response = await POST(request as never);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toContain('storagePath');
    });

    it('should return 400 when fileName is missing', async () => {
      const { POST } = await import('./route');
      const request = createMockRequest({ storagePath: 'path/to/file.xlsx' });

      const response = await POST(request as never);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toContain('fileName');
    });

    it('should return 400 when both parameters are missing', async () => {
      const { POST } = await import('./route');
      const request = createMockRequest({});

      const response = await POST(request as never);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
    });

    it('should accept valid storagePath and fileName', async () => {
      mockStorageDownload.mockResolvedValue({
        data: createMockBlob('content'),
        error: null,
      });
      mockDetectFileType.mockResolvedValue('CONSOLIDADO');

      const { POST } = await import('./route');
      const request = createMockRequest({
        storagePath: 'valid/path/file.xlsx',
        fileName: 'valid-file.xlsx',
      });

      const response = await POST(request as never);

      // Should proceed past validation
      expect(response.status).not.toBe(400);
    });
  });

  describe('Storage Download', () => {
    it('should return 404 when file not found in storage', async () => {
      mockStorageDownload.mockResolvedValue({
        data: null,
        error: { message: 'Object not found' },
      });

      const { POST } = await import('./route');
      const request = createMockRequest({
        storagePath: 'nonexistent.xlsx',
        fileName: 'test.xlsx',
      });

      const response = await POST(request as never);
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error).toContain('descargar archivo');
    });

    it('should return 404 when storage returns null data without error', async () => {
      mockStorageDownload.mockResolvedValue({
        data: null,
        error: null,
      });

      const { POST } = await import('./route');
      const request = createMockRequest({
        storagePath: 'empty.xlsx',
        fileName: 'test.xlsx',
      });

      const response = await POST(request as never);
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Archivo no encontrado');
    });

    it('should proceed when file is downloaded successfully', async () => {
      mockStorageDownload.mockResolvedValue({
        data: createMockBlob('excel content'),
        error: null,
      });
      mockDetectFileType.mockResolvedValue('UNKNOWN');

      const { POST } = await import('./route');
      const request = createMockRequest({
        storagePath: 'valid.xlsx',
        fileName: 'test.xlsx',
      });

      const response = await POST(request as never);

      // Should fail at file type detection, not download
      expect(response.status).toBe(400);
    });
  });

  describe('File Type Detection', () => {
    it('should return 400 for unknown file type', async () => {
      mockStorageDownload.mockResolvedValue({
        data: createMockBlob('random content'),
        error: null,
      });
      mockDetectFileType.mockResolvedValue('UNKNOWN');

      const { POST } = await import('./route');
      const request = createMockRequest({
        storagePath: 'unknown.xlsx',
        fileName: 'unknown.xlsx',
      });

      const response = await POST(request as never);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toContain('detectar el tipo');
      // Should cleanup the file from storage
      expect(mockStorageRemove).toHaveBeenCalled();
    });

    it('should use fileTypeHint when provided', async () => {
      mockStorageDownload.mockResolvedValue({
        data: createMockBlob('excel content'),
        error: null,
      });
      mockDetectFileType.mockResolvedValue('UNKNOWN'); // Auto-detect fails

      const { POST } = await import('./route');
      const request = createMockRequest({
        storagePath: 'file.xlsx',
        fileName: 'file.xlsx',
        fileTypeHint: 'CONSOLIDADO',
      });

      const response = await POST(request as never);
      const body = await response.json();

      expect(body.success).toBe(true);
      expect(body.fileType).toBe('CONSOLIDADO');
    });

    it('should ignore invalid fileTypeHint', async () => {
      mockStorageDownload.mockResolvedValue({
        data: createMockBlob('excel content'),
        error: null,
      });
      mockDetectFileType.mockResolvedValue('UNKNOWN');

      const { POST } = await import('./route');
      const request = createMockRequest({
        storagePath: 'file.xlsx',
        fileName: 'file.xlsx',
        fileTypeHint: 'INVALID',
      });

      const response = await POST(request as never);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toContain('detectar el tipo');
    });
  });

  describe('Storage Cleanup', () => {
    it('should delete file from storage after successful processing', async () => {
      mockStorageDownload.mockResolvedValue({
        data: createMockBlob('excel content'),
        error: null,
      });
      mockDetectFileType.mockResolvedValue('CONSOLIDADO');

      const { POST } = await import('./route');
      const request = createMockRequest({
        storagePath: 'test/path/file.xlsx',
        fileName: 'test.xlsx',
      });

      await POST(request as never);

      expect(mockStorageRemove).toHaveBeenCalledWith(['test/path/file.xlsx']);
    });

    it('should continue even if storage cleanup fails', async () => {
      mockStorageDownload.mockResolvedValue({
        data: createMockBlob('excel content'),
        error: null,
      });
      mockDetectFileType.mockResolvedValue('CONSOLIDADO');
      mockStorageRemove.mockResolvedValue({ error: { message: 'Delete failed' } });

      const { POST } = await import('./route');
      const request = createMockRequest({
        storagePath: 'file.xlsx',
        fileName: 'file.xlsx',
      });

      const response = await POST(request as never);
      const body = await response.json();

      // Should still succeed even if cleanup fails
      expect(body.success).toBe(true);
    });

    it('should cleanup file on unknown file type error', async () => {
      mockStorageDownload.mockResolvedValue({
        data: createMockBlob('content'),
        error: null,
      });
      mockDetectFileType.mockResolvedValue('UNKNOWN');

      const { POST } = await import('./route');
      const request = createMockRequest({
        storagePath: 'cleanup-test.xlsx',
        fileName: 'test.xlsx',
      });

      await POST(request as never);

      expect(mockStorageRemove).toHaveBeenCalledWith(['cleanup-test.xlsx']);
    });
  });

  describe('Error Handling', () => {
    it('should handle JSON parse errors in request body', async () => {
      const { POST } = await import('./route');
      const request = {
        json: () => Promise.reject(new Error('Invalid JSON')),
        headers: new Headers({ 'content-type': 'application/json' }),
      } as unknown as Request;

      const response = await POST(request as never);
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.success).toBe(false);
    });

    it('should handle parser exceptions', async () => {
      mockStorageDownload.mockResolvedValue({
        data: createMockBlob('excel content'),
        error: null,
      });
      mockDetectFileType.mockResolvedValue('CONSOLIDADO');
      mockParseConsolidadoReal.mockRejectedValue(new Error('Parser crashed'));

      const { POST } = await import('./route');
      const request = createMockRequest({
        storagePath: 'bad.xlsx',
        fileName: 'bad.xlsx',
      });

      const response = await POST(request as never);
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Parser crashed');
    });

    it('should include auditId in error response', async () => {
      mockStorageDownload.mockResolvedValue({
        data: createMockBlob('excel content'),
        error: null,
      });
      mockDetectFileType.mockResolvedValue('CONSOLIDADO');
      mockParseConsolidadoReal.mockRejectedValue(new Error('Processing error'));

      const { POST } = await import('./route');
      const request = createMockRequest({
        storagePath: 'error.xlsx',
        fileName: 'error.xlsx',
      });

      const response = await POST(request as never);
      const body = await response.json();

      expect(body.auditId).toBe('test-audit-uuid-12345');
      expect(body.success).toBe(false);
    });

    it('should handle non-Error exceptions', async () => {
      mockStorageDownload.mockResolvedValue({
        data: createMockBlob('excel content'),
        error: null,
      });
      mockDetectFileType.mockResolvedValue('CONSOLIDADO');
      mockParseConsolidadoReal.mockRejectedValue('String error');

      const { POST } = await import('./route');
      const request = createMockRequest({
        storagePath: 'error.xlsx',
        fileName: 'error.xlsx',
      });

      const response = await POST(request as never);
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error).toContain('procesar el archivo');
    });
  });

  describe('Success Response', () => {
    it('should return success for CONSOLIDADO file', async () => {
      mockStorageDownload.mockResolvedValue({
        data: createMockBlob('excel content'),
        error: null,
      });
      mockDetectFileType.mockResolvedValue('CONSOLIDADO');
      mockParseConsolidadoReal.mockResolvedValue({
        success: true,
        data: [],
        metadata: {
          totalRows: 10,
          extractedDate: new Date('2026-01-10'),
          dateSource: 'filename',
        },
        errors: [],
      });

      const { POST } = await import('./route');
      const request = createMockRequest({
        storagePath: 'consolidado.xlsx',
        fileName: 'CONSOLIDADO - 10.01.xlsx',
      });

      const response = await POST(request as never);
      const body = await response.json();

      expect(body.success).toBe(true);
      expect(body.fileType).toBe('CONSOLIDADO');
      expect(body.auditId).toBe('test-audit-uuid-12345');
    });

    it('should return success for PICOS file', async () => {
      mockStorageDownload.mockResolvedValue({
        data: createMockBlob('excel content'),
        error: null,
      });
      mockDetectFileType.mockResolvedValue('PICOS');
      mockParsePicosReal.mockResolvedValue({
        success: true,
        data: [],
        metadata: {
          totalRows: 5,
          extractedDate: new Date('2026-01-01'),
          dateSource: 'header',
        },
        errors: [],
      });

      const { POST } = await import('./route');
      const request = createMockRequest({
        storagePath: 'picos.xlsx',
        fileName: 'PICOS_2026.xlsx',
      });

      const response = await POST(request as never);
      const body = await response.json();

      expect(body.success).toBe(true);
      expect(body.fileType).toBe('PICOS');
    });

    it('should include syncStats in response', async () => {
      mockStorageDownload.mockResolvedValue({
        data: createMockBlob('excel content'),
        error: null,
      });
      mockDetectFileType.mockResolvedValue('CONSOLIDADO');
      mockParseConsolidadoReal.mockResolvedValue({
        success: true,
        data: [],
        metadata: { totalRows: 0, extractedDate: null, dateSource: 'unknown' },
        errors: [],
      });

      const { POST } = await import('./route');
      const request = createMockRequest({
        storagePath: 'test.xlsx',
        fileName: 'test.xlsx',
      });

      const response = await POST(request as never);
      const body = await response.json();

      expect(body.syncStats).toBeDefined();
      expect(typeof body.syncStats.positionsProcessed).toBe('number');
      expect(typeof body.syncStats.durationMs).toBe('number');
    });

    it('should include extractedDate when available', async () => {
      mockStorageDownload.mockResolvedValue({
        data: createMockBlob('excel content'),
        error: null,
      });
      mockDetectFileType.mockResolvedValue('CONSOLIDADO');
      mockParseConsolidadoReal.mockResolvedValue({
        success: true,
        data: [],
        metadata: {
          totalRows: 0,
          extractedDate: new Date('2026-01-15'),
          dateSource: 'filename',
        },
        errors: [],
      });

      const { POST } = await import('./route');
      const request = createMockRequest({
        storagePath: 'test.xlsx',
        fileName: 'CONSOLIDADO - 15.01.xlsx',
      });

      const response = await POST(request as never);
      const body = await response.json();

      expect(body.extractedDate).toBe('2026-01-15T00:00:00.000Z');
      expect(body.dateSource).toBe('filename');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty file content', async () => {
      mockStorageDownload.mockResolvedValue({
        data: createMockBlob(''),
        error: null,
      });
      mockDetectFileType.mockResolvedValue('CONSOLIDADO');

      const { POST } = await import('./route');
      const request = createMockRequest({
        storagePath: 'empty.xlsx',
        fileName: 'empty.xlsx',
      });

      const response = await POST(request as never);
      const body = await response.json();

      expect(body.success).toBe(true);
      expect(body.data.metadata.totalRows).toBe(0);
    });

    it('should handle very long storage paths', async () => {
      const longPath = 'a'.repeat(500) + '.xlsx';
      mockStorageDownload.mockResolvedValue({
        data: createMockBlob('content'),
        error: null,
      });
      mockDetectFileType.mockResolvedValue('CONSOLIDADO');

      const { POST } = await import('./route');
      const request = createMockRequest({
        storagePath: longPath,
        fileName: 'test.xlsx',
      });

      const response = await POST(request as never);

      // Should handle without crashing
      expect(response).toBeDefined();
      expect(response.status).not.toBe(500);
    });

    it('should handle unicode in file names', async () => {
      mockStorageDownload.mockResolvedValue({
        data: createMockBlob('content'),
        error: null,
      });
      mockDetectFileType.mockResolvedValue('CONSOLIDADO');

      const { POST } = await import('./route');
      const request = createMockRequest({
        storagePath: 'path/archivo_espanol.xlsx',
        fileName: 'CONSOLIDADO - Seleccion 10.01.xlsx',
      });

      const response = await POST(request as never);
      const body = await response.json();

      expect(body.success).toBe(true);
    });

    it('should handle file with parse errors but valid partial data', async () => {
      mockStorageDownload.mockResolvedValue({
        data: createMockBlob('excel content'),
        error: null,
      });
      mockDetectFileType.mockResolvedValue('CONSOLIDADO');
      mockParseConsolidadoReal.mockResolvedValue({
        success: false, // Parser reports issues
        data: [{ codigo: 'POS-001' }], // But has some data
        metadata: { totalRows: 1, extractedDate: null, dateSource: 'unknown' },
        errors: [{ row: 2, message: 'Invalid date format' }],
      });

      const { POST } = await import('./route');
      const request = createMockRequest({
        storagePath: 'partial.xlsx',
        fileName: 'partial.xlsx',
      });

      const response = await POST(request as never);
      const body = await response.json();

      // Should still succeed with partial data
      expect(body.success).toBe(true);
      expect(body.data.errors.length).toBeGreaterThan(0);
    });
  });
});
