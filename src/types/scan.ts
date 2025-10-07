/**
 * Daily Scan System - TypeScript Type Definitions
 *
 * This file contains all types for the ReddyFit Daily Scan system,
 * including scan data, AI analysis results, and user insights.
 */

import { Timestamp } from 'firebase/firestore';

// ============================================================================
// SCAN TYPES
// ============================================================================

/**
 * Angle for body scan photos
 */
export type ScanAngle = 'front' | 'back' | 'left' | 'right';

/**
 * Scan status during processing
 */
export type ScanStatus = 'capturing' | 'uploading' | 'processing' | 'completed' | 'failed';

/**
 * Quality check result
 */
export interface QualityCheckResult {
  isValid: boolean;
  issues: string[];
  confidence: number; // 0-1
}

/**
 * Single scan photo with metadata
 */
export interface ScanPhoto {
  angle: ScanAngle;
  url: string;
  storagePath: string;
  capturedAt: Date | Timestamp;
  fileSize: number; // bytes
  dimensions?: {
    width: number;
    height: number;
  };
}

/**
 * Body composition metrics from AI analysis
 */
export interface BodyComposition {
  bodyFatPercent: number; // e.g., 18.5
  leanBodyMass: number; // lbs
  totalWeight: number; // lbs
  estimatedMusclePercent: number; // e.g., 45.2
  estimatedBoneDensity?: number; // optional advanced metric
  visceralFatLevel?: number; // 1-12 scale (optional)
}

/**
 * Changes compared to previous scan
 */
export interface ScanDelta {
  bodyFatDelta: number; // change in BF% (can be negative)
  leanMassDelta: number; // change in LBM (can be negative)
  weightDelta: number; // change in weight (can be negative)
  daysSinceLastScan: number;
  trend: 'improving' | 'stable' | 'declining';
}

/**
 * AI-generated insights and recommendations
 */
export interface DailyInsight {
  id: string;
  scanId: string;
  userId: string;
  createdAt: Date | Timestamp;

  // Summary
  summary: string; // One-sentence overview

  // Detailed insights
  progressAnalysis: string; // What changed and why
  nutritionRecommendation: string; // Calorie/macro adjustments
  workoutRecommendation: string; // Training suggestions
  hydrationRecommendation: string; // Water intake

  // Advanced (optional)
  muscleSymmetry?: {
    leftRight: number; // 0-1 (1 = perfect symmetry)
    issues: string[];
  };
  postureAnalysis?: {
    score: number; // 0-100
    issues: string[];
  };

  // Motivational
  motivationalMessage: string;
  nextMilestone?: string; // "5 more days to reach 15% BF"
}

/**
 * Complete daily scan record
 */
export interface Scan {
  id: string;
  userId: string;
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;

  // Status
  status: ScanStatus;
  errorMessage?: string;

  // Photos
  photos: ScanPhoto[];

  // User input
  weight: number; // lbs
  notes?: string; // Optional user notes

  // AI Analysis Results
  qualityCheck?: QualityCheckResult;
  bodyComposition?: BodyComposition;
  delta?: ScanDelta;
  insightId?: string; // Reference to DailyInsight document

  // Processing metadata
  processingStartedAt?: Date | Timestamp;
  processingCompletedAt?: Date | Timestamp;
  processingDuration?: number; // seconds

  // Privacy
  isPublic: boolean; // Can others see this scan?
  sharedWithTrainer: boolean; // For B2B feature
}

/**
 * Scan history summary for timeline view
 */
export interface ScanHistorySummary {
  totalScans: number;
  firstScanDate: Date;
  lastScanDate: Date;
  currentStreak: number; // consecutive days
  longestStreak: number;
  averageBF: number;
  averageLBM: number;
  totalWeightLost: number;
  totalBFLost: number;
}

/**
 * User streak tracking
 */
export interface ScanStreak {
  userId: string;
  currentStreak: number; // consecutive days with scans
  longestStreak: number;
  lastScanDate: Date | Timestamp;
  streakStartDate: Date | Timestamp;
  totalScans: number;

  // Milestones
  milestones: {
    fiveDay: boolean;
    tenDay: boolean;
    thirtyDay: boolean;
    hundredDay: boolean;
  };
}

// ============================================================================
// GEMINI API TYPES
// ============================================================================

/**
 * Request to Gemini Vision API
 */
export interface GeminiVisionRequest {
  photos: ScanPhoto[];
  weight: number;
  userContext?: {
    age?: number;
    gender?: 'male' | 'female' | 'other';
    height?: number; // cm
    fitnessGoal?: string;
  };
}

/**
 * Response from Gemini Vision API
 */
export interface GeminiVisionResponse {
  success: boolean;
  bodyComposition?: BodyComposition;
  qualityCheck: QualityCheckResult;
  confidence: number; // 0-1
  modelVersion: string; // e.g., "gemini-2.0-flash"
  processingTime: number; // milliseconds
  errorMessage?: string;
}

/**
 * Insight generation request
 */
export interface InsightGenerationRequest {
  currentScan: Scan;
  previousScan?: Scan;
  userHistory: {
    totalScans: number;
    averageBF: number;
    goal: string;
  };
}

// ============================================================================
// UI STATE TYPES
// ============================================================================

/**
 * Camera capture state
 */
export interface CameraState {
  isActive: boolean;
  currentAngle: ScanAngle;
  capturedAngles: ScanAngle[];
  stream?: MediaStream;
  facingMode: 'user' | 'environment';
}

/**
 * Upload progress state
 */
export interface UploadProgress {
  angle: ScanAngle;
  progress: number; // 0-100
  isComplete: boolean;
}

/**
 * Wizard step
 */
export type WizardStep = 'intro' | 'capture' | 'upload' | 'processing' | 'results';

/**
 * Daily Scan wizard state
 */
export interface DailyScanState {
  currentStep: WizardStep;
  capturedPhotos: ScanPhoto[];
  weight: number | null;
  notes: string;
  isProcessing: boolean;
  scanId?: string;
  error?: string;
}

// ============================================================================
// HELPER TYPES
// ============================================================================

/**
 * Date range for filtering scans
 */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Sort options for scan history
 */
export type ScanSortBy = 'date' | 'bodyFat' | 'weight' | 'leanMass';

/**
 * Chart data point
 */
export interface ChartDataPoint {
  date: string; // ISO string
  bodyFat: number;
  leanMass: number;
  weight: number;
}

/**
 * Export format options
 */
export type ExportFormat = 'csv' | 'json' | 'pdf';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Scan angle order for wizard
 */
export const SCAN_ANGLE_ORDER: ScanAngle[] = ['front', 'back', 'left', 'right'];

/**
 * Angle display names
 */
export const ANGLE_DISPLAY_NAMES: Record<ScanAngle, string> = {
  front: 'Front View',
  back: 'Back View',
  left: 'Left Side',
  right: 'Right Side',
};

/**
 * Pose instructions for each angle
 */
export const POSE_INSTRUCTIONS: Record<ScanAngle, string> = {
  front: 'Stand straight, arms relaxed at your sides, look forward',
  back: 'Turn around, stand straight, arms relaxed at your sides',
  left: 'Turn to your left side, stand straight, arm at your side',
  right: 'Turn to your right side, stand straight, arm at your side',
};

/**
 * Maximum file size for scan photos (10MB)
 */
export const MAX_SCAN_PHOTO_SIZE = 10 * 1024 * 1024;

/**
 * Maximum scan photos per user
 */
export const MAX_SCANS_PER_USER = 365; // 1 year of daily scans

/**
 * Scan processing timeout (5 minutes)
 */
export const SCAN_PROCESSING_TIMEOUT = 5 * 60 * 1000;
