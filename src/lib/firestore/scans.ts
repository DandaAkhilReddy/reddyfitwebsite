/**
 * Firestore Helper Functions for Daily Scan System
 *
 * This file provides CRUD operations and query functions for managing
 * scan data in Firestore.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  serverTimestamp,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type {
  Scan,
  ScanPhoto,
  BodyComposition,
  ScanDelta,
  QualityCheckResult,
  ScanStatus,
  ScanAngle,
} from '../../types/scan';

// Collection names
const SCANS_COLLECTION = 'scans';
const INSIGHTS_COLLECTION = 'dailyInsights';
const STREAKS_COLLECTION = 'scanStreaks';

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

/**
 * Create a new scan record
 */
export async function createScan(
  userId: string,
  weight: number,
  notes?: string
): Promise<string> {
  try {
    const scanRef = doc(collection(db, SCANS_COLLECTION));
    const scanId = scanRef.id;

    const newScan: Omit<Scan, 'id'> = {
      userId,
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp,
      status: 'capturing',
      photos: [],
      weight,
      notes: notes || '',
      isPublic: false,
      sharedWithTrainer: false,
    };

    await setDoc(scanRef, newScan);
    return scanId;
  } catch (error) {
    console.error('Error creating scan:', error);
    throw new Error('Failed to create scan');
  }
}

/**
 * Add a photo to an existing scan
 */
export async function addScanPhoto(
  scanId: string,
  photo: ScanPhoto
): Promise<void> {
  try {
    const scanRef = doc(db, SCANS_COLLECTION, scanId);
    const scanDoc = await getDoc(scanRef);

    if (!scanDoc.exists()) {
      throw new Error('Scan not found');
    }

    const currentPhotos = (scanDoc.data().photos as ScanPhoto[]) || [];
    const updatedPhotos = [...currentPhotos, photo];

    await updateDoc(scanRef, {
      photos: updatedPhotos,
      updatedAt: serverTimestamp(),
      status: updatedPhotos.length === 4 ? 'uploading' : 'capturing',
    });
  } catch (error) {
    console.error('Error adding scan photo:', error);
    throw new Error('Failed to add scan photo');
  }
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * Get a single scan by ID
 */
export async function getScan(scanId: string): Promise<Scan | null> {
  try {
    const scanRef = doc(db, SCANS_COLLECTION, scanId);
    const scanDoc = await getDoc(scanRef);

    if (!scanDoc.exists()) {
      return null;
    }

    return {
      id: scanDoc.id,
      ...scanDoc.data(),
    } as Scan;
  } catch (error) {
    console.error('Error getting scan:', error);
    return null;
  }
}

/**
 * Get all scans for a user
 */
export async function getUserScans(
  userId: string,
  limitCount: number = 100
): Promise<Scan[]> {
  try {
    const scansRef = collection(db, SCANS_COLLECTION);
    const q = query(
      scansRef,
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Scan[];
  } catch (error) {
    console.error('Error getting user scans:', error);
    return [];
  }
}

/**
 * Get the most recent scan for a user
 */
export async function getLatestScan(userId: string): Promise<Scan | null> {
  try {
    const scans = await getUserScans(userId, 1);
    return scans.length > 0 ? scans[0] : null;
  } catch (error) {
    console.error('Error getting latest scan:', error);
    return null;
  }
}

/**
 * Get completed scans only
 */
export async function getCompletedScans(
  userId: string,
  limitCount: number = 50
): Promise<Scan[]> {
  try {
    const scansRef = collection(db, SCANS_COLLECTION);
    const q = query(
      scansRef,
      where('userId', '==', userId),
      where('status', '==', 'completed'),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Scan[];
  } catch (error) {
    console.error('Error getting completed scans:', error);
    return [];
  }
}

/**
 * Get scans within a date range
 */
export async function getScansByDateRange(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<Scan[]> {
  try {
    const scansRef = collection(db, SCANS_COLLECTION);
    const q = query(
      scansRef,
      where('userId', '==', userId),
      where('createdAt', '>=', Timestamp.fromDate(startDate)),
      where('createdAt', '<=', Timestamp.fromDate(endDate)),
      orderBy('createdAt', 'desc')
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Scan[];
  } catch (error) {
    console.error('Error getting scans by date range:', error);
    return [];
  }
}

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

/**
 * Update scan status
 */
export async function updateScanStatus(
  scanId: string,
  status: ScanStatus,
  errorMessage?: string
): Promise<void> {
  try {
    const scanRef = doc(db, SCANS_COLLECTION, scanId);
    const updateData: Record<string, unknown> = {
      status,
      updatedAt: serverTimestamp(),
    };

    if (errorMessage) {
      updateData.errorMessage = errorMessage;
    }

    if (status === 'processing') {
      updateData.processingStartedAt = serverTimestamp();
    }

    if (status === 'completed') {
      updateData.processingCompletedAt = serverTimestamp();
    }

    await updateDoc(scanRef, updateData);
  } catch (error) {
    console.error('Error updating scan status:', error);
    throw new Error('Failed to update scan status');
  }
}

/**
 * Update scan with AI analysis results
 */
export async function updateScanWithAnalysis(
  scanId: string,
  data: {
    qualityCheck?: QualityCheckResult;
    bodyComposition?: BodyComposition;
    delta?: ScanDelta;
    insightId?: string;
  }
): Promise<void> {
  try {
    const scanRef = doc(db, SCANS_COLLECTION, scanId);
    await updateDoc(scanRef, {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating scan with analysis:', error);
    throw new Error('Failed to update scan analysis');
  }
}

/**
 * Update scan privacy settings
 */
export async function updateScanPrivacy(
  scanId: string,
  isPublic: boolean,
  sharedWithTrainer: boolean
): Promise<void> {
  try {
    const scanRef = doc(db, SCANS_COLLECTION, scanId);
    await updateDoc(scanRef, {
      isPublic,
      sharedWithTrainer,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating scan privacy:', error);
    throw new Error('Failed to update scan privacy');
  }
}

/**
 * Update scan notes
 */
export async function updateScanNotes(
  scanId: string,
  notes: string
): Promise<void> {
  try {
    const scanRef = doc(db, SCANS_COLLECTION, scanId);
    await updateDoc(scanRef, {
      notes,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating scan notes:', error);
    throw new Error('Failed to update scan notes');
  }
}

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

/**
 * Delete a scan (soft delete by marking as deleted)
 */
export async function deleteScan(scanId: string): Promise<void> {
  try {
    const scanRef = doc(db, SCANS_COLLECTION, scanId);
    // For now, we'll hard delete. Later, implement soft delete with a 'deleted' flag
    await deleteDoc(scanRef);
  } catch (error) {
    console.error('Error deleting scan:', error);
    throw new Error('Failed to delete scan');
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if user has scanned today
 */
export async function hasScannedToday(userId: string): Promise<boolean> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const scansRef = collection(db, SCANS_COLLECTION);
    const q = query(
      scansRef,
      where('userId', '==', userId),
      where('createdAt', '>=', Timestamp.fromDate(today)),
      where('createdAt', '<', Timestamp.fromDate(tomorrow)),
      limit(1)
    );

    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
  } catch (error) {
    console.error('Error checking if user scanned today:', error);
    return false;
  }
}

/**
 * Get total scan count for user
 */
export async function getScanCount(userId: string): Promise<number> {
  try {
    const scansRef = collection(db, SCANS_COLLECTION);
    const q = query(
      scansRef,
      where('userId', '==', userId),
      where('status', '==', 'completed')
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.size;
  } catch (error) {
    console.error('Error getting scan count:', error);
    return 0;
  }
}

/**
 * Calculate processing duration
 */
export function calculateProcessingDuration(scan: Scan): number {
  if (!scan.processingStartedAt || !scan.processingCompletedAt) {
    return 0;
  }

  const startTime =
    scan.processingStartedAt instanceof Timestamp
      ? scan.processingStartedAt.toMillis()
      : new Date(scan.processingStartedAt).getTime();

  const endTime =
    scan.processingCompletedAt instanceof Timestamp
      ? scan.processingCompletedAt.toMillis()
      : new Date(scan.processingCompletedAt).getTime();

  return Math.round((endTime - startTime) / 1000); // seconds
}

/**
 * Validate scan data
 */
export function validateScanData(scan: Partial<Scan>): boolean {
  if (!scan.userId) return false;
  if (scan.weight === undefined || scan.weight <= 0) return false;
  if (scan.photos && scan.photos.length !== 4) return false;
  return true;
}

/**
 * Get scan photo by angle
 */
export function getScanPhotoByAngle(
  scan: Scan,
  angle: ScanAngle
): ScanPhoto | undefined {
  return scan.photos.find((photo) => photo.angle === angle);
}

/**
 * Check if all photos are captured
 */
export function allPhotosCaptured(scan: Scan): boolean {
  const requiredAngles: ScanAngle[] = ['front', 'back', 'left', 'right'];
  return requiredAngles.every((angle) =>
    scan.photos.some((photo) => photo.angle === angle)
  );
}
