/**
 * Firebase Storage Service
 *
 * Handles uploading scan photos to Firebase Storage.
 * Organizes photos by user ID and scan ID for easy retrieval.
 */

import {
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  UploadTaskSnapshot,
} from 'firebase/storage';
import { storage } from '../config/firebase';
import type { ScanAngle, ScanPhoto } from '../types/scan';

/**
 * Upload progress callback
 */
export type UploadProgressCallback = (progress: number) => void;

/**
 * Generate storage path for scan photo
 */
export function getScanPhotoPath(
  userId: string,
  scanId: string,
  angle: ScanAngle
): string {
  return `scans/${userId}/${scanId}/${angle}.jpg`;
}

/**
 * Upload a single scan photo to Firebase Storage
 */
export async function uploadScanPhoto(
  userId: string,
  scanId: string,
  angle: ScanAngle,
  photoBlob: Blob,
  onProgress?: UploadProgressCallback
): Promise<ScanPhoto> {
  try {
    const path = getScanPhotoPath(userId, scanId, angle);
    const storageRef = ref(storage, path);

    // If progress callback provided, use resumable upload
    if (onProgress) {
      const uploadTask = uploadBytesResumable(storageRef, photoBlob, {
        contentType: 'image/jpeg',
      });

      // Monitor upload progress
      return new Promise((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot: UploadTaskSnapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            onProgress(progress);
          },
          (error) => {
            console.error('Upload error:', error);
            reject(new Error(`Failed to upload ${angle} photo: ${error.message}`));
          },
          async () => {
            // Upload completed successfully
            try {
              const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);

              const scanPhoto: ScanPhoto = {
                angle,
                url: downloadUrl,
                storagePath: path,
                capturedAt: new Date(),
                fileSize: photoBlob.size,
              };

              resolve(scanPhoto);
            } catch (error) {
              reject(error);
            }
          }
        );
      });
    } else {
      // Simple upload without progress tracking
      const snapshot = await uploadBytes(storageRef, photoBlob, {
        contentType: 'image/jpeg',
      });

      const downloadUrl = await getDownloadURL(snapshot.ref);

      const scanPhoto: ScanPhoto = {
        angle,
        url: downloadUrl,
        storagePath: path,
        capturedAt: new Date(),
        fileSize: photoBlob.size,
      };

      return scanPhoto;
    }
  } catch (error) {
    console.error(`Error uploading ${angle} photo:`, error);
    throw new Error(
      `Failed to upload ${angle} photo: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Upload all 4 scan photos with progress tracking
 */
export async function uploadAllScanPhotos(
  userId: string,
  scanId: string,
  photoBlobs: Map<ScanAngle, Blob>,
  onProgressUpdate?: (angle: ScanAngle, progress: number) => void
): Promise<ScanPhoto[]> {
  const angles: ScanAngle[] = ['front', 'back', 'left', 'right'];
  const uploadPromises: Promise<ScanPhoto>[] = [];

  for (const angle of angles) {
    const blob = photoBlobs.get(angle);

    if (!blob) {
      throw new Error(`Missing photo for angle: ${angle}`);
    }

    const progressCallback = onProgressUpdate
      ? (progress: number) => onProgressUpdate(angle, progress)
      : undefined;

    uploadPromises.push(
      uploadScanPhoto(userId, scanId, angle, blob, progressCallback)
    );
  }

  try {
    // Upload all photos in parallel
    const photos = await Promise.all(uploadPromises);
    return photos;
  } catch (error) {
    console.error('Error uploading scan photos:', error);
    throw error;
  }
}

/**
 * Delete a scan photo from storage
 */
export async function deleteScanPhoto(storagePath: string): Promise<void> {
  try {
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
  } catch (error) {
    // Ignore errors if file doesn't exist
    if (error instanceof Error && !error.message.includes('object-not-found')) {
      console.error('Error deleting scan photo:', error);
      throw error;
    }
  }
}

/**
 * Delete all photos for a scan
 */
export async function deleteAllScanPhotos(
  userId: string,
  scanId: string
): Promise<void> {
  const angles: ScanAngle[] = ['front', 'back', 'left', 'right'];

  const deletePromises = angles.map((angle) => {
    const path = getScanPhotoPath(userId, scanId, angle);
    return deleteScanPhoto(path);
  });

  await Promise.all(deletePromises);
}

/**
 * Estimate upload time based on file size and connection speed
 */
export function estimateUploadTime(
  totalBytes: number,
  connectionSpeedMbps: number = 10 // Default to 10 Mbps
): number {
  // Convert Mbps to bytes per second
  const bytesPerSecond = (connectionSpeedMbps * 1_000_000) / 8;

  // Calculate estimated time in seconds
  const estimatedSeconds = totalBytes / bytesPerSecond;

  // Add 20% buffer for overhead
  return Math.ceil(estimatedSeconds * 1.2);
}

/**
 * Get total size of all photo blobs
 */
export function getTotalPhotoSize(photoBlobs: Map<ScanAngle, Blob>): number {
  let totalSize = 0;

  photoBlobs.forEach((blob) => {
    totalSize += blob.size;
  });

  return totalSize;
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
