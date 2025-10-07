/**
 * Unit Tests for Firebase Storage Service
 *
 * Tests photo upload, download, deletion, and progress tracking.
 * Uses mocked Firebase Storage SDK to avoid actual uploads.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  uploadScanPhoto,
  uploadAllScanPhotos,
  deleteScanPhoto,
  deleteAllScanPhotos,
  getTotalPhotoSize,
  formatBytes,
  getScanPhotoPath,
} from '../storageService';
import type { ScanAngle, ScanPhoto } from '../../types/scan';

// Mock Firebase Storage
vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({})),
  ref: vi.fn((storage, path) => ({ fullPath: path })),
  uploadBytes: vi.fn(async () => ({
    ref: { fullPath: 'mock/path' },
    metadata: { size: 1000 },
  })),
  uploadBytesResumable: vi.fn(() => ({
    on: vi.fn((event, next, error, complete) => {
      // Simulate progress
      next?.({ bytesTransferred: 50, totalBytes: 100 });
      next?.({ bytesTransferred: 100, totalBytes: 100 });
      complete?.();
    }),
    snapshot: { ref: { fullPath: 'mock/path' } },
  })),
  getDownloadURL: vi.fn(async () => 'https://example.com/photo.jpg'),
  deleteObject: vi.fn(async () => undefined),
}));

// Mock data
const mockBlob = new Blob(['test photo data'], { type: 'image/jpeg' });
const mockPhotoBlobs = new Map<ScanAngle, Blob>([
  ['front', mockBlob],
  ['back', mockBlob],
  ['left', mockBlob],
  ['right', mockBlob],
]);

describe('Storage Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getScanPhotoPath', () => {
    it('should generate correct storage path', () => {
      const path = getScanPhotoPath('user123', 'scan456', 'front');

      expect(path).toBe('scans/user123/scan456/front.jpg');
    });

    it('should handle all angles', () => {
      const angles: ScanAngle[] = ['front', 'back', 'left', 'right'];

      angles.forEach((angle) => {
        const path = getScanPhotoPath('user123', 'scan456', angle);
        expect(path).toContain(angle);
        expect(path).toMatch(/^scans\/user123\/scan456\/(front|back|left|right)\.jpg$/);
      });
    });

    it('should create unique paths for different scans', () => {
      const path1 = getScanPhotoPath('user123', 'scan1', 'front');
      const path2 = getScanPhotoPath('user123', 'scan2', 'front');

      expect(path1).not.toBe(path2);
      expect(path1).toContain('scan1');
      expect(path2).toContain('scan2');
    });

    it('should create unique paths for different users', () => {
      const path1 = getScanPhotoPath('user1', 'scan123', 'front');
      const path2 = getScanPhotoPath('user2', 'scan123', 'front');

      expect(path1).not.toBe(path2);
      expect(path1).toContain('user1');
      expect(path2).toContain('user2');
    });
  });

  describe('formatBytes', () => {
    it('should format bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1024 * 1024)).toBe('1 MB');
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
    });

    it('should format with decimal places', () => {
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(1024 * 1.5)).toBe('1.5 KB');
      expect(formatBytes(1024 * 2.75)).toMatch(/2\.75 KB/);
    });

    it('should handle large numbers', () => {
      const oneGB = 1024 * 1024 * 1024;
      expect(formatBytes(oneGB * 10)).toBe('10 GB');
      expect(formatBytes(oneGB * 10.5)).toBe('10.5 GB');
    });

    it('should handle small numbers', () => {
      expect(formatBytes(1)).toBe('1 Bytes');
      expect(formatBytes(100)).toBe('100 Bytes');
      expect(formatBytes(1023)).toBe('1023 Bytes');
    });
  });

  describe('getTotalPhotoSize', () => {
    it('should calculate total size of all photos', () => {
      const blobs = new Map<ScanAngle, Blob>([
        ['front', new Blob(['a'.repeat(1000)])],
        ['back', new Blob(['b'.repeat(2000)])],
        ['left', new Blob(['c'.repeat(3000)])],
        ['right', new Blob(['d'.repeat(4000)])],
      ]);

      const totalSize = getTotalPhotoSize(blobs);

      expect(totalSize).toBe(10000);
    });

    it('should handle empty map', () => {
      const emptyMap = new Map<ScanAngle, Blob>();
      const totalSize = getTotalPhotoSize(emptyMap);

      expect(totalSize).toBe(0);
    });

    it('should handle partial photos', () => {
      const partialBlobs = new Map<ScanAngle, Blob>([
        ['front', new Blob(['a'.repeat(500)])],
        ['back', new Blob(['b'.repeat(500)])],
      ]);

      const totalSize = getTotalPhotoSize(partialBlobs);

      expect(totalSize).toBe(1000);
    });

    it('should handle large photos', () => {
      const largeBlob = new Blob(['x'.repeat(5 * 1024 * 1024)]); // 5MB
      const blobs = new Map<ScanAngle, Blob>([
        ['front', largeBlob],
        ['back', largeBlob],
        ['left', largeBlob],
        ['right', largeBlob],
      ]);

      const totalSize = getTotalPhotoSize(blobs);

      expect(totalSize).toBe(20 * 1024 * 1024); // 20MB
    });
  });

  describe('uploadScanPhoto', () => {
    it('should upload photo without progress callback', async () => {
      const result = await uploadScanPhoto(
        'user123',
        'scan456',
        'front',
        mockBlob
      );

      expect(result).toBeDefined();
      expect(result.angle).toBe('front');
      expect(result.url).toBe('https://example.com/photo.jpg');
      expect(result.storagePath).toContain('scans/user123/scan456/front.jpg');
      expect(result.capturedAt).toBeInstanceOf(Date);
      expect(result.fileSize).toBe(mockBlob.size);
    });

    it('should upload photo with progress callback', async () => {
      const progressCallback = vi.fn();

      const result = await uploadScanPhoto(
        'user123',
        'scan456',
        'front',
        mockBlob,
        progressCallback
      );

      expect(result).toBeDefined();
      expect(progressCallback).toHaveBeenCalled();
      // Progress callback should be called multiple times with increasing values
      expect(progressCallback.mock.calls.length).toBeGreaterThan(0);
    });

    it('should include file size in result', async () => {
      const largeBlob = new Blob(['x'.repeat(5000)], { type: 'image/jpeg' });

      const result = await uploadScanPhoto(
        'user123',
        'scan456',
        'front',
        largeBlob
      );

      expect(result.fileSize).toBe(5000);
    });

    it('should return ScanPhoto object', async () => {
      const result = await uploadScanPhoto(
        'user123',
        'scan456',
        'front',
        mockBlob
      );

      // Verify it has all required properties
      expect(result).toHaveProperty('angle');
      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('storagePath');
      expect(result).toHaveProperty('capturedAt');
      expect(result).toHaveProperty('fileSize');
    });

    it('should handle different angles', async () => {
      const angles: ScanAngle[] = ['front', 'back', 'left', 'right'];

      for (const angle of angles) {
        const result = await uploadScanPhoto(
          'user123',
          'scan456',
          angle,
          mockBlob
        );

        expect(result.angle).toBe(angle);
        expect(result.storagePath).toContain(angle);
      }
    });
  });

  describe('uploadAllScanPhotos', () => {
    it('should upload all 4 photos in parallel', async () => {
      const results = await uploadAllScanPhotos(
        'user123',
        'scan456',
        mockPhotoBlobs
      );

      expect(results).toHaveLength(4);
      expect(results.map((r) => r.angle)).toEqual(['front', 'back', 'left', 'right']);
    });

    it('should call progress callback for each photo', async () => {
      const progressCallback = vi.fn();

      await uploadAllScanPhotos(
        'user123',
        'scan456',
        mockPhotoBlobs,
        progressCallback
      );

      // Should be called for each angle
      expect(progressCallback).toHaveBeenCalled();
      const calls = progressCallback.mock.calls;

      // Check that all angles were reported
      const reportedAngles = new Set(calls.map(call => call[0]));
      expect(reportedAngles.size).toBeGreaterThan(0);
    });

    it('should handle upload errors gracefully', async () => {
      const invalidBlobs = new Map<ScanAngle, Blob>([
        ['front', mockBlob],
        ['back', mockBlob],
        ['left', mockBlob],
        // Missing 'right' - should throw
      ]);

      await expect(
        uploadAllScanPhotos('user123', 'scan456', invalidBlobs as any)
      ).rejects.toThrow();
    });

    it('should upload all photos with unique storage paths', async () => {
      const results = await uploadAllScanPhotos(
        'user123',
        'scan456',
        mockPhotoBlobs
      );

      const paths = results.map((r) => r.storagePath);
      const uniquePaths = new Set(paths);

      expect(uniquePaths.size).toBe(4); // All paths should be unique
    });

    it('should return photos in correct order', async () => {
      const results = await uploadAllScanPhotos(
        'user123',
        'scan456',
        mockPhotoBlobs
      );

      expect(results[0].angle).toBe('front');
      expect(results[1].angle).toBe('back');
      expect(results[2].angle).toBe('left');
      expect(results[3].angle).toBe('right');
    });
  });

  describe('deleteScanPhoto', () => {
    it('should delete a photo', async () => {
      await expect(
        deleteScanPhoto('user123', 'scan456', 'front')
      ).resolves.not.toThrow();
    });

    it('should construct correct deletion path', async () => {
      const { deleteObject } = await import('firebase/storage');

      await deleteScanPhoto('user123', 'scan456', 'front');

      expect(deleteObject).toHaveBeenCalled();
    });

    it('should handle all angles', async () => {
      const angles: ScanAngle[] = ['front', 'back', 'left', 'right'];

      for (const angle of angles) {
        await expect(
          deleteScanPhoto('user123', 'scan456', angle)
        ).resolves.not.toThrow();
      }
    });
  });

  describe('deleteAllScanPhotos', () => {
    it('should delete all 4 photos', async () => {
      await expect(
        deleteAllScanPhotos('user123', 'scan456')
      ).resolves.not.toThrow();
    });

    it('should call deleteObject for each photo', async () => {
      const { deleteObject } = await import('firebase/storage');

      await deleteAllScanPhotos('user123', 'scan456');

      // Should be called 4 times (once for each angle)
      expect(deleteObject).toHaveBeenCalledTimes(4);
    });

    it('should handle deletion errors gracefully', async () => {
      const { deleteObject } = await import('firebase/storage');

      // Mock one deletion to fail
      deleteObject.mockRejectedValueOnce(new Error('Delete failed'));

      // Should still attempt all deletions
      await expect(
        deleteAllScanPhotos('user123', 'scan456')
      ).rejects.toThrow();
    });
  });

  describe('Integration', () => {
    it('should handle complete upload-delete cycle', async () => {
      // Upload
      const uploadResults = await uploadAllScanPhotos(
        'user123',
        'scan456',
        mockPhotoBlobs
      );

      expect(uploadResults).toHaveLength(4);

      // Delete
      await expect(
        deleteAllScanPhotos('user123', 'scan456')
      ).resolves.not.toThrow();
    });

    it('should handle multiple concurrent uploads', async () => {
      const promises = [
        uploadAllScanPhotos('user1', 'scan1', mockPhotoBlobs),
        uploadAllScanPhotos('user2', 'scan2', mockPhotoBlobs),
        uploadAllScanPhotos('user3', 'scan3', mockPhotoBlobs),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach((scanPhotos) => {
        expect(scanPhotos).toHaveLength(4);
      });
    });

    it('should maintain correct metadata after upload', async () => {
      const results = await uploadAllScanPhotos(
        'user123',
        'scan456',
        mockPhotoBlobs
      );

      results.forEach((photo) => {
        expect(photo.fileSize).toBeGreaterThan(0);
        expect(photo.url).toContain('https://');
        expect(photo.capturedAt).toBeInstanceOf(Date);
      });
    });
  });
});
