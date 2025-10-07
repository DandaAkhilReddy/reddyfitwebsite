/**
 * Firestore Helper Functions for Scan History & Analytics
 *
 * This file provides functions for analyzing scan history, calculating streaks,
 * generating trend data, and managing user progress over time.
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { getUserScans, getCompletedScans } from './scans';
import type {
  Scan,
  ScanHistorySummary,
  ScanStreak,
  ChartDataPoint,
  ScanDelta,
} from '../../types/scan';
import { startOfDay, differenceInDays, format } from 'date-fns';

const STREAKS_COLLECTION = 'scanStreaks';

// ============================================================================
// SCAN HISTORY & SUMMARY
// ============================================================================

/**
 * Get scan history summary for a user
 */
export async function getScanHistorySummary(
  userId: string
): Promise<ScanHistorySummary | null> {
  try {
    const scans = await getCompletedScans(userId);

    if (scans.length === 0) {
      return null;
    }

    // Calculate metrics
    const bfValues = scans
      .filter((s) => s.bodyComposition?.bodyFatPercent)
      .map((s) => s.bodyComposition!.bodyFatPercent);

    const lbmValues = scans
      .filter((s) => s.bodyComposition?.leanBodyMass)
      .map((s) => s.bodyComposition!.leanBodyMass);

    const firstScan = scans[scans.length - 1];
    const lastScan = scans[0];

    const averageBF =
      bfValues.reduce((sum, val) => sum + val, 0) / bfValues.length;
    const averageLBM =
      lbmValues.reduce((sum, val) => sum + val, 0) / lbmValues.length;

    const firstWeight = firstScan.weight;
    const lastWeight = lastScan.weight;
    const firstBF = firstScan.bodyComposition?.bodyFatPercent || 0;
    const lastBF = lastScan.bodyComposition?.bodyFatPercent || 0;

    const streak = await getCurrentStreak(userId);

    return {
      totalScans: scans.length,
      firstScanDate: toDate(firstScan.createdAt),
      lastScanDate: toDate(lastScan.createdAt),
      currentStreak: streak?.currentStreak || 0,
      longestStreak: streak?.longestStreak || 0,
      averageBF: Math.round(averageBF * 10) / 10,
      averageLBM: Math.round(averageLBM * 10) / 10,
      totalWeightLost: Math.round((firstWeight - lastWeight) * 10) / 10,
      totalBFLost: Math.round((firstBF - lastBF) * 10) / 10,
    };
  } catch (error) {
    console.error('Error getting scan history summary:', error);
    return null;
  }
}

/**
 * Get chart data for trend visualization
 */
export async function getScanChartData(
  userId: string,
  limitCount: number = 30
): Promise<ChartDataPoint[]> {
  try {
    const scans = await getCompletedScans(userId, limitCount);

    return scans
      .filter((scan) => scan.bodyComposition)
      .map((scan) => ({
        date: toDate(scan.createdAt).toISOString(),
        bodyFat: scan.bodyComposition!.bodyFatPercent,
        leanMass: scan.bodyComposition!.leanBodyMass,
        weight: scan.weight,
      }))
      .reverse(); // Oldest to newest for chart
  } catch (error) {
    console.error('Error getting scan chart data:', error);
    return [];
  }
}

// ============================================================================
// STREAK TRACKING
// ============================================================================

/**
 * Get user's current streak
 */
export async function getCurrentStreak(
  userId: string
): Promise<ScanStreak | null> {
  try {
    const streakRef = doc(db, STREAKS_COLLECTION, userId);
    const streakDoc = await getDoc(streakRef);

    if (!streakDoc.exists()) {
      return null;
    }

    return {
      userId: streakDoc.id,
      ...streakDoc.data(),
    } as ScanStreak;
  } catch (error) {
    console.error('Error getting current streak:', error);
    return null;
  }
}

/**
 * Update user's streak after a scan
 */
export async function updateStreak(userId: string): Promise<ScanStreak> {
  try {
    const streakRef = doc(db, STREAKS_COLLECTION, userId);
    const existingStreak = await getCurrentStreak(userId);

    const today = startOfDay(new Date());
    const todayTimestamp = Timestamp.fromDate(today);

    if (!existingStreak) {
      // Create new streak
      const newStreak: Omit<ScanStreak, 'userId'> = {
        currentStreak: 1,
        longestStreak: 1,
        lastScanDate: todayTimestamp,
        streakStartDate: todayTimestamp,
        totalScans: 1,
        milestones: {
          fiveDay: false,
          tenDay: false,
          thirtyDay: false,
          hundredDay: false,
        },
      };

      await setDoc(streakRef, newStreak);
      return { userId, ...newStreak };
    }

    // Check last scan date
    const lastScanDate = toDate(existingStreak.lastScanDate);
    const daysSinceLastScan = differenceInDays(today, startOfDay(lastScanDate));

    let updatedStreak: Partial<ScanStreak> = {
      lastScanDate: todayTimestamp,
      totalScans: existingStreak.totalScans + 1,
    };

    if (daysSinceLastScan === 0) {
      // Already scanned today, no streak change
      return existingStreak;
    } else if (daysSinceLastScan === 1) {
      // Consecutive day, increment streak
      updatedStreak.currentStreak = existingStreak.currentStreak + 1;
      updatedStreak.longestStreak = Math.max(
        existingStreak.longestStreak,
        updatedStreak.currentStreak
      );
    } else {
      // Streak broken, restart
      updatedStreak.currentStreak = 1;
      updatedStreak.streakStartDate = todayTimestamp;
    }

    // Update milestones
    const currentStreak = updatedStreak.currentStreak || existingStreak.currentStreak;
    updatedStreak.milestones = {
      fiveDay: currentStreak >= 5,
      tenDay: currentStreak >= 10,
      thirtyDay: currentStreak >= 30,
      hundredDay: currentStreak >= 100,
    };

    await updateDoc(streakRef, updatedStreak);

    return {
      ...existingStreak,
      ...updatedStreak,
    } as ScanStreak;
  } catch (error) {
    console.error('Error updating streak:', error);
    throw new Error('Failed to update streak');
  }
}

/**
 * Check if user needs to scan today to maintain streak
 */
export async function needsToScanToday(userId: string): Promise<boolean> {
  try {
    const streak = await getCurrentStreak(userId);

    if (!streak) {
      return true; // New user, should scan
    }

    const today = startOfDay(new Date());
    const lastScanDate = toDate(streak.lastScanDate);
    const daysSinceLastScan = differenceInDays(today, startOfDay(lastScanDate));

    return daysSinceLastScan >= 1;
  } catch (error) {
    console.error('Error checking if needs to scan today:', error);
    return false;
  }
}

// ============================================================================
// PROGRESS COMPARISON
// ============================================================================

/**
 * Calculate delta between two scans
 */
export function calculateScanDelta(
  currentScan: Scan,
  previousScan: Scan
): ScanDelta {
  const currentBF = currentScan.bodyComposition?.bodyFatPercent || 0;
  const previousBF = previousScan.bodyComposition?.bodyFatPercent || 0;

  const currentLBM = currentScan.bodyComposition?.leanBodyMass || 0;
  const previousLBM = previousScan.bodyComposition?.leanBodyMass || 0;

  const currentWeight = currentScan.weight;
  const previousWeight = previousScan.weight;

  const bodyFatDelta = parseFloat((currentBF - previousBF).toFixed(1));
  const leanMassDelta = parseFloat((currentLBM - previousLBM).toFixed(1));
  const weightDelta = parseFloat((currentWeight - previousWeight).toFixed(1));

  const daysSince = differenceInDays(
    toDate(currentScan.createdAt),
    toDate(previousScan.createdAt)
  );

  // Determine trend
  let trend: 'improving' | 'stable' | 'declining';
  if (bodyFatDelta < -0.5) {
    trend = 'improving'; // BF% decreased
  } else if (bodyFatDelta > 0.5) {
    trend = 'declining'; // BF% increased
  } else {
    trend = 'stable';
  }

  return {
    bodyFatDelta,
    leanMassDelta,
    weightDelta,
    daysSinceLastScan: daysSince,
    trend,
  };
}

/**
 * Get previous scan for comparison
 */
export async function getPreviousScan(
  userId: string,
  currentScanId: string
): Promise<Scan | null> {
  try {
    const scans = await getCompletedScans(userId, 50);
    const currentIndex = scans.findIndex((scan) => scan.id === currentScanId);

    if (currentIndex === -1 || currentIndex === scans.length - 1) {
      return null; // No previous scan
    }

    return scans[currentIndex + 1];
  } catch (error) {
    console.error('Error getting previous scan:', error);
    return null;
  }
}

// ============================================================================
// ANALYTICS & INSIGHTS
// ============================================================================

/**
 * Calculate average progress rate (BF% loss per week)
 */
export async function getAverageBFLossPerWeek(
  userId: string
): Promise<number> {
  try {
    const scans = await getCompletedScans(userId);

    if (scans.length < 2) {
      return 0;
    }

    const firstScan = scans[scans.length - 1];
    const lastScan = scans[0];

    const firstBF = firstScan.bodyComposition?.bodyFatPercent || 0;
    const lastBF = lastScan.bodyComposition?.bodyFatPercent || 0;

    const totalBFLoss = firstBF - lastBF;
    const daysBetween = differenceInDays(
      toDate(lastScan.createdAt),
      toDate(firstScan.createdAt)
    );

    const weeksBetween = daysBetween / 7;
    return parseFloat((totalBFLoss / weeksBetween).toFixed(2));
  } catch (error) {
    console.error('Error calculating average BF loss per week:', error);
    return 0;
  }
}

/**
 * Get estimated time to reach goal BF%
 */
export async function estimateTimeToGoal(
  userId: string,
  goalBF: number
): Promise<number | null> {
  try {
    const summary = await getScanHistorySummary(userId);

    if (!summary || summary.totalScans < 3) {
      return null; // Not enough data
    }

    const avgLossPerWeek = await getAverageBFLossPerWeek(userId);

    if (avgLossPerWeek <= 0) {
      return null; // No progress or negative progress
    }

    const latestScans = await getCompletedScans(userId, 1);
    const currentBF = latestScans[0]?.bodyComposition?.bodyFatPercent || 0;

    const bfToLose = currentBF - goalBF;

    if (bfToLose <= 0) {
      return 0; // Already at or below goal
    }

    const weeksToGoal = bfToLose / avgLossPerWeek;
    return Math.ceil(weeksToGoal);
  } catch (error) {
    console.error('Error estimating time to goal:', error);
    return null;
  }
}

/**
 * Get scan frequency (scans per week)
 */
export async function getScanFrequency(userId: string): Promise<number> {
  try {
    const scans = await getCompletedScans(userId);

    if (scans.length < 2) {
      return 0;
    }

    const firstScan = scans[scans.length - 1];
    const lastScan = scans[0];

    const daysBetween = differenceInDays(
      toDate(lastScan.createdAt),
      toDate(firstScan.createdAt)
    );

    const weeksBetween = daysBetween / 7;
    return parseFloat((scans.length / weeksBetween).toFixed(1));
  } catch (error) {
    console.error('Error getting scan frequency:', error);
    return 0;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert Firestore Timestamp to Date
 */
function toDate(timestamp: Date | Timestamp): Date {
  return timestamp instanceof Timestamp ? timestamp.toDate() : new Date(timestamp);
}

/**
 * Format date for display
 */
export function formatScanDate(timestamp: Date | Timestamp): string {
  return format(toDate(timestamp), 'MMM d, yyyy');
}

/**
 * Format date for chart
 */
export function formatChartDate(timestamp: Date | Timestamp): string {
  return format(toDate(timestamp), 'MM/dd');
}

/**
 * Check if milestone reached
 */
export function checkMilestoneReached(
  previousStreak: number,
  currentStreak: number,
  milestone: number
): boolean {
  return previousStreak < milestone && currentStreak >= milestone;
}
