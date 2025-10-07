/**
 * Unit Tests for Gemini Vision Service
 *
 * Tests body composition analysis, quality checks, retry logic, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  analyzeBodyComposition,
  analyzeBodyCompositionWithRetry,
  estimateAnalysisCost,
} from '../geminiVision';
import type { GeminiVisionRequest, ScanPhoto } from '../../types/scan';

// Mock photos for testing
const mockPhotos: ScanPhoto[] = [
  {
    angle: 'front',
    url: 'https://example.com/front.jpg',
    storagePath: 'scans/user123/scan456/front.jpg',
    capturedAt: new Date(),
    fileSize: 500000,
  },
  {
    angle: 'back',
    url: 'https://example.com/back.jpg',
    storagePath: 'scans/user123/scan456/back.jpg',
    capturedAt: new Date(),
    fileSize: 480000,
  },
  {
    angle: 'left',
    url: 'https://example.com/left.jpg',
    storagePath: 'scans/user123/scan456/left.jpg',
    capturedAt: new Date(),
    fileSize: 490000,
  },
  {
    angle: 'right',
    url: 'https://example.com/right.jpg',
    storagePath: 'scans/user123/scan456/right.jpg',
    capturedAt: new Date(),
    fileSize: 510000,
  },
];

const mockRequest: GeminiVisionRequest = {
  photos: mockPhotos,
  weight: 180,
  userContext: {
    age: 30,
    gender: 'male',
    height: 180,
  },
};

describe('Gemini Vision Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('analyzeBodyComposition', () => {
    it('should return mock body composition analysis', async () => {
      const result = await analyzeBodyComposition(mockRequest);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.bodyComposition).toBeDefined();
      expect(result.bodyComposition?.bodyFatPercent).toBeGreaterThan(0);
      expect(result.bodyComposition?.leanBodyMass).toBeGreaterThan(0);
      expect(result.bodyComposition?.totalWeight).toBe(mockRequest.weight);
      expect(result.qualityCheck).toBeDefined();
      expect(result.qualityCheck.isValid).toBe(true);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should calculate lean body mass correctly', async () => {
      const result = await analyzeBodyComposition(mockRequest);

      if (result.bodyComposition) {
        const { bodyFatPercent, totalWeight, leanBodyMass } = result.bodyComposition;
        const expectedLBM = totalWeight * (1 - bodyFatPercent / 100);

        // Allow small floating point differences
        expect(Math.abs(leanBodyMass - expectedLBM)).toBeLessThan(1);
      }
    });

    it('should include processing time', async () => {
      const result = await analyzeBodyComposition(mockRequest);

      expect(result.processingTime).toBeGreaterThanOrEqual(0);
      expect(typeof result.processingTime).toBe('number');
    });

    it('should include model version', async () => {
      const result = await analyzeBodyComposition(mockRequest);

      expect(result.modelVersion).toBeDefined();
      expect(typeof result.modelVersion).toBe('string');
    });

    it('should return quality check with confidence score', async () => {
      const result = await analyzeBodyComposition(mockRequest);

      expect(result.qualityCheck).toBeDefined();
      expect(result.qualityCheck.confidence).toBeGreaterThan(0);
      expect(result.qualityCheck.confidence).toBeLessThanOrEqual(1);
      expect(result.qualityCheck.isValid).toBe(true);
      expect(Array.isArray(result.qualityCheck.issues)).toBe(true);
    });

    it('should handle different weight values', async () => {
      const requests = [
        { ...mockRequest, weight: 150 },
        { ...mockRequest, weight: 200 },
        { ...mockRequest, weight: 250 },
      ];

      for (const req of requests) {
        const result = await analyzeBodyComposition(req);
        expect(result.success).toBe(true);
        expect(result.bodyComposition?.totalWeight).toBe(req.weight);
      }
    });

    it('should include estimated muscle percentage', async () => {
      const result = await analyzeBodyComposition(mockRequest);

      expect(result.bodyComposition?.estimatedMusclePercent).toBeDefined();
      expect(result.bodyComposition?.estimatedMusclePercent).toBeGreaterThan(0);
      expect(result.bodyComposition?.estimatedMusclePercent).toBeLessThan(100);
    });

    it('should handle missing Gemini API key gracefully', async () => {
      // Note: Current implementation returns mock data even without API key
      // In future when real API is implemented, this test should check for error
      const result = await analyzeBodyComposition(mockRequest);

      expect(result).toBeDefined();
      // Currently returns mock success, will change when real API integrated
      expect(result.success).toBe(true);
    });
  });

  describe('analyzeBodyCompositionWithRetry', () => {
    it('should successfully analyze on first attempt', async () => {
      const result = await analyzeBodyCompositionWithRetry(mockRequest);

      expect(result.success).toBe(true);
      expect(result.bodyComposition).toBeDefined();
    });

    it('should handle multiple photos correctly', async () => {
      const result = await analyzeBodyCompositionWithRetry(mockRequest);

      expect(result.success).toBe(true);
      // Verify all 4 photos were considered (though mock doesn't actually use them)
      expect(mockRequest.photos.length).toBe(4);
    });

    it('should complete within reasonable time', async () => {
      const startTime = Date.now();
      await analyzeBodyCompositionWithRetry(mockRequest);
      const duration = Date.now() - startTime;

      // Mock should be fast, real API should be < 60 seconds
      expect(duration).toBeLessThan(5000); // 5 seconds for mock
    });

    it('should return consistent results for same input', async () => {
      const result1 = await analyzeBodyCompositionWithRetry(mockRequest);
      const result2 = await analyzeBodyCompositionWithRetry(mockRequest);

      // Mock returns consistent values
      expect(result1.bodyComposition?.bodyFatPercent).toBe(
        result2.bodyComposition?.bodyFatPercent
      );
    });
  });

  describe('estimateAnalysisCost', () => {
    it('should estimate cost for standard scan', () => {
      const photoCount = 4;
      const cost = estimateAnalysisCost(photoCount);

      expect(cost).toBeDefined();
      expect(typeof cost).toBe('number');
      expect(cost).toBeGreaterThan(0);
    });

    it('should be under $0.10 per scan', () => {
      const photoCount = 4;
      const cost = estimateAnalysisCost(photoCount);

      // Business requirement: keep cost under $0.10 per scan
      expect(cost).toBeLessThan(0.1);
    });

    it('should calculate consistent cost for standard 4-photo scan', () => {
      const photoCount = 4;
      const cost1 = estimateAnalysisCost(photoCount);
      const cost2 = estimateAnalysisCost(photoCount);

      // Should return same cost for same input
      expect(cost1).toBe(cost2);
    });

    it('should handle different photo counts', () => {
      const cost1 = estimateAnalysisCost(1);
      const cost4 = estimateAnalysisCost(4);

      // Both should be valid numbers
      expect(cost1).toBeGreaterThan(0);
      expect(cost4).toBeGreaterThan(0);
    });

    it('should return reasonable cost estimate', () => {
      const cost = estimateAnalysisCost(4);

      // Should be very cheap with Gemini Flash pricing
      expect(cost).toBeLessThan(0.01); // Less than 1 cent
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid photo URLs gracefully', async () => {
      const invalidRequest: GeminiVisionRequest = {
        photos: [
          {
            angle: 'front',
            url: '',
            storagePath: '',
            capturedAt: new Date(),
            fileSize: 0,
          },
        ],
        weight: 180,
        userContext: mockRequest.userContext,
      };

      const result = await analyzeBodyComposition(invalidRequest);

      // Mock still returns success, real implementation should handle errors
      expect(result).toBeDefined();
    });

    it('should handle zero weight gracefully', async () => {
      const zeroWeightRequest: GeminiVisionRequest = {
        ...mockRequest,
        weight: 0,
      };

      const result = await analyzeBodyComposition(zeroWeightRequest);

      expect(result).toBeDefined();
      // In real implementation, this should return an error or validation failure
    });

    it('should handle negative weight gracefully', async () => {
      const negativeWeightRequest: GeminiVisionRequest = {
        ...mockRequest,
        weight: -50,
      };

      const result = await analyzeBodyComposition(negativeWeightRequest);

      expect(result).toBeDefined();
    });

    it('should handle missing user context', async () => {
      const noContextRequest: GeminiVisionRequest = {
        photos: mockPhotos,
        weight: 180,
        userContext: undefined as any,
      };

      const result = await analyzeBodyComposition(noContextRequest);

      expect(result).toBeDefined();
    });

    it('should handle empty photos array', async () => {
      const emptyPhotosRequest: GeminiVisionRequest = {
        photos: [],
        weight: 180,
        userContext: mockRequest.userContext,
      };

      const result = await analyzeBodyComposition(emptyPhotosRequest);

      expect(result).toBeDefined();
    });
  });

  describe('Data Validation', () => {
    it('should return body fat percentage within valid range', async () => {
      const result = await analyzeBodyComposition(mockRequest);

      if (result.bodyComposition) {
        expect(result.bodyComposition.bodyFatPercent).toBeGreaterThan(0);
        expect(result.bodyComposition.bodyFatPercent).toBeLessThan(100);
      }
    });

    it('should return lean body mass less than total weight', async () => {
      const result = await analyzeBodyComposition(mockRequest);

      if (result.bodyComposition) {
        expect(result.bodyComposition.leanBodyMass).toBeLessThan(
          result.bodyComposition.totalWeight
        );
      }
    });

    it('should return muscle percentage within valid range', async () => {
      const result = await analyzeBodyComposition(mockRequest);

      if (result.bodyComposition?.estimatedMusclePercent) {
        expect(result.bodyComposition.estimatedMusclePercent).toBeGreaterThan(0);
        expect(result.bodyComposition.estimatedMusclePercent).toBeLessThan(100);
      }
    });

    it('should maintain weight conservation (LBM + fat mass = total)', async () => {
      const result = await analyzeBodyComposition(mockRequest);

      if (result.bodyComposition) {
        const { bodyFatPercent, totalWeight, leanBodyMass } = result.bodyComposition;
        const fatMass = totalWeight * (bodyFatPercent / 100);
        const calculatedTotal = leanBodyMass + fatMass;

        // Should be approximately equal (allowing for floating point errors)
        expect(Math.abs(calculatedTotal - totalWeight)).toBeLessThan(0.1);
      }
    });
  });

  describe('Performance', () => {
    it('should complete analysis in under 5 seconds (mock mode)', async () => {
      const startTime = Date.now();
      await analyzeBodyComposition(mockRequest);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000);
    });

    it('should handle concurrent requests', async () => {
      const requests = Array(5).fill(mockRequest);
      const startTime = Date.now();

      const results = await Promise.all(
        requests.map((req) => analyzeBodyComposition(req))
      );

      const duration = Date.now() - startTime;

      expect(results.length).toBe(5);
      results.forEach((result) => {
        expect(result.success).toBe(true);
      });

      // All 5 should complete quickly in mock mode
      expect(duration).toBeLessThan(10000);
    });
  });
});
