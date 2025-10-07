/**
 * Gemini Vision API Service
 *
 * Handles body composition analysis using Google's Gemini AI.
 * Uses Gemini 2.0 Flash for fast, accurate multimodal analysis.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  GeminiVisionRequest,
  GeminiVisionResponse,
  BodyComposition,
  QualityCheckResult,
} from '../types/scan';

// Initialize Gemini AI
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

if (!apiKey) {
  console.warn('⚠️ VITE_GEMINI_API_KEY not found in environment variables');
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

// Model configuration
const QUALITY_CHECK_MODEL = 'gemini-2.0-flash-lite'; // Fast model for QC
const ANALYSIS_MODEL = 'gemini-2.0-flash-exp'; // Accurate model for analysis

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const TIMEOUT_MS = 30000; // 30 second timeout

/**
 * Convert Blob to base64 data URL for Gemini
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert blob to base64'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Quality check photos before analysis
 * Returns true if photos are suitable for analysis
 */
export async function performQualityCheck(
  photoBlobs: Map<string, Blob>
): Promise<QualityCheckResult> {
  if (!genAI) {
    return {
      isValid: false,
      issues: ['Gemini API key not configured'],
      confidence: 0,
    };
  }

  try {
    const model = genAI.getGenerativeModel({ model: QUALITY_CHECK_MODEL });

    // Convert blobs to base64
    const photoPromises = Array.from(photoBlobs.entries()).map(
      async ([angle, blob]) => ({
        angle,
        data: await blobToBase64(blob),
      })
    );

    const photos = await Promise.all(photoPromises);

    // Create prompt for quality check
    const prompt = `You are a quality control expert for body composition photos. Analyze these 4 body scan photos (front, back, left, right) and determine if they are suitable for body composition analysis.

Check for:
1. Clear visibility of the person's body
2. Adequate lighting (not too dark or overexposed)
3. Person is standing straight with proper posture
4. Full body visible (head to feet)
5. Minimal clothing obstruction
6. No blur or motion artifacts
7. Consistent distance from camera across all angles

Return a JSON object with:
{
  "isValid": boolean,
  "issues": ["list of specific issues found"],
  "confidence": number (0-1)
}

If photos are suitable, set isValid to true and confidence to 0.8-1.0.
If minor issues exist, list them but may still set isValid to true with lower confidence.
If major issues exist, set isValid to false.`;

    // Send request to Gemini
    const imageParts = photos.map((photo) => ({
      inlineData: {
        data: photo.data.split(',')[1], // Remove data URL prefix
        mimeType: 'image/jpeg',
      },
    }));

    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const text = response.text();

    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse quality check response');
    }

    const qualityResult = JSON.parse(jsonMatch[0]);

    return {
      isValid: qualityResult.isValid || false,
      issues: qualityResult.issues || [],
      confidence: qualityResult.confidence || 0,
    };
  } catch (error) {
    console.error('Quality check error:', error);
    return {
      isValid: false,
      issues: ['Quality check failed: ' + (error instanceof Error ? error.message : 'Unknown error')],
      confidence: 0,
    };
  }
}

/**
 * Analyze body composition from 4-angle photos
 */
export async function analyzeBodyComposition(
  request: GeminiVisionRequest
): Promise<GeminiVisionResponse> {
  const startTime = Date.now();

  if (!genAI) {
    return {
      success: false,
      qualityCheck: {
        isValid: false,
        issues: ['Gemini API key not configured. Please add VITE_GEMINI_API_KEY to your .env.local file.'],
        confidence: 0,
      },
      confidence: 0,
      modelVersion: 'none',
      processingTime: Date.now() - startTime,
      errorMessage: 'Gemini API not initialized',
    };
  }

  try {
    const model = genAI.getGenerativeModel({ model: ANALYSIS_MODEL });

    // Convert photo blobs to base64
    const photoPromises = request.photos.map(async (photo) => {
      // If photo has a url (already uploaded), fetch it
      // For now, we'll assume photos are passed as blobs in a Map
      // This will be updated when we integrate Firebase Storage
      return {
        angle: photo.angle,
        data: photo.url, // Placeholder - will use actual blob in Phase 26-30
      };
    });

    const photos = await Promise.all(photoPromises);

    // Build analysis prompt
    const userContext = request.userContext || {};
    const age = userContext.age || 30;
    const gender = userContext.gender || 'unknown';
    const height = userContext.height || 175;
    const weight = request.weight;

    const prompt = `You are an expert body composition analyst with medical training. Analyze these 4 body scan photos to estimate body composition metrics.

**User Information:**
- Weight: ${weight} lbs
- Height: ${height} cm
- Age: ${age} years
- Gender: ${gender}
- Fitness Goal: ${userContext.fitnessGoal || 'general fitness'}

**Photos Provided:**
1. Front view - full body standing
2. Back view - full body standing
3. Left side view - full body standing
4. Right side view - full body standing

**Analysis Requirements:**
Provide accurate estimates for:
1. **Body Fat Percentage** (±2% accuracy)
   - Use visual cues: muscle definition, fat deposits, waist-to-hip ratio
   - Consider age, gender, and visible muscle tone

2. **Lean Body Mass** (in pounds)
   - Calculate: LBM = Total Weight × (1 - Body Fat %)

3. **Estimated Muscle Percentage**
   - Visual assessment of muscle development
   - Consider muscle definition and size

4. **Posture Quality Score** (0-100)
   - Assess spinal alignment, shoulder position, hip alignment

**Important:**
- Be conservative with estimates (avoid extreme values)
- Consider gender-specific body composition norms
- Account for age-related changes
- Flag any visible asymmetries or concerns

**Output Format:**
Return ONLY a JSON object (no markdown, no explanation):
{
  "bodyFatPercent": number (5-50 range),
  "leanBodyMass": number (in lbs),
  "estimatedMusclePercent": number (20-55 range),
  "postureScore": number (0-100),
  "confidence": number (0-1),
  "notes": "brief assessment notes"
}`;

    // For now, we'll use a mock response since we don't have actual photo blobs yet
    // This will be replaced with real Gemini calls in Phase 26-30
    console.log('📸 Gemini Analysis Request:', { weight, height, age, gender });

    // Mock response for testing (remove in Phase 26-30)
    const mockBodyComp: BodyComposition = {
      bodyFatPercent: 18.5,
      leanBodyMass: weight * 0.815,
      totalWeight: weight,
      estimatedMusclePercent: 42.3,
    };

    return {
      success: true,
      bodyComposition: mockBodyComp,
      qualityCheck: {
        isValid: true,
        issues: [],
        confidence: 0.85,
      },
      confidence: 0.85,
      modelVersion: ANALYSIS_MODEL,
      processingTime: Date.now() - startTime,
    };

    /* Uncomment this when ready to make real API calls in Phase 26-30:

    const imageParts = photos.map((photo) => ({
      inlineData: {
        data: photo.data.split(',')[1],
        mimeType: 'image/jpeg',
      },
    }));

    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const text = response.text();

    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse analysis response');
    }

    const analysisResult = JSON.parse(jsonMatch[0]);

    const bodyComposition: BodyComposition = {
      bodyFatPercent: analysisResult.bodyFatPercent,
      leanBodyMass: analysisResult.leanBodyMass,
      totalWeight: weight,
      estimatedMusclePercent: analysisResult.estimatedMusclePercent,
    };

    return {
      success: true,
      bodyComposition,
      qualityCheck: {
        isValid: true,
        issues: [],
        confidence: analysisResult.confidence,
      },
      confidence: analysisResult.confidence,
      modelVersion: ANALYSIS_MODEL,
      processingTime: Date.now() - startTime,
    };
    */
  } catch (error) {
    console.error('Body composition analysis error:', error);

    return {
      success: false,
      qualityCheck: {
        isValid: false,
        issues: ['Analysis failed'],
        confidence: 0,
      },
      confidence: 0,
      modelVersion: ANALYSIS_MODEL,
      processingTime: Date.now() - startTime,
      errorMessage: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Analyze body composition with retry logic
 */
export async function analyzeBodyCompositionWithRetry(
  request: GeminiVisionRequest,
  retries = MAX_RETRIES
): Promise<GeminiVisionResponse> {
  try {
    return await analyzeBodyComposition(request);
  } catch (error) {
    if (retries > 0) {
      console.log(`Retrying analysis... (${retries} attempts remaining)`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return analyzeBodyCompositionWithRetry(request, retries - 1);
    }

    throw error;
  }
}

/**
 * Estimate cost of analysis
 * Gemini 2.0 Flash pricing: ~$0.02 per 1M tokens
 */
export function estimateAnalysisCost(photoCount: number): number {
  // Rough estimate: 4 photos + prompt ≈ 5000 tokens
  const tokensPerAnalysis = 5000;
  const costPerMillionTokens = 0.02;
  const tokenCost = (tokensPerAnalysis / 1_000_000) * costPerMillionTokens;

  // Add small buffer for API overhead
  return tokenCost * 1.2;
}
