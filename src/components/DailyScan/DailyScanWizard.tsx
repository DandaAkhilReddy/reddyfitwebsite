/**
 * Daily Scan Wizard Component
 *
 * Multi-step wizard for capturing 4-angle body scan photos.
 * Steps: Intro → Capture Photos → Upload → Processing → Results
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Loader2, CheckCircle, AlertCircle, Upload, Flame } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { createScan, updateScanStatus, hasScannedToday, updateScanWithAnalysis } from '../../lib/firestore/scans';
import { updateStreak, getPreviousScan, calculateScanDelta } from '../../lib/firestore/scanHistory';
import type { WizardStep, ScanPhoto, ScanAngle, GeminiVisionRequest } from '../../types/scan';
import { SCAN_ANGLE_ORDER, ANGLE_DISPLAY_NAMES } from '../../types/scan';
import CameraCapture from './CameraCapture';
import { analyzeBodyCompositionWithRetry } from '../../services/geminiVision';
import { uploadAllScanPhotos, getTotalPhotoSize, formatBytes } from '../../services/storageService';

interface DailyScanWizardProps {
  onComplete?: (scanId: string) => void;
  onCancel?: () => void;
}

const DailyScanWizard: React.FC<DailyScanWizardProps> = ({ onComplete, onCancel }) => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>('intro');
  const [capturedPhotos, setCapturedPhotos] = useState<ScanPhoto[]>([]);
  const [photoBlobs, setPhotoBlobs] = useState<Map<ScanAngle, Blob>>(new Map());
  const [currentAngle, setCurrentAngle] = useState<ScanAngle>('front');
  const [weight, setWeight] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [scanId, setScanId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasScannedTodayState, setHasScannedTodayState] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Map<ScanAngle, number>>(new Map());

  // Check if user has already scanned today
  useEffect(() => {
    if (user?.uid) {
      hasScannedToday(user.uid).then(setHasScannedTodayState);
    }
  }, [user?.uid]);

  // Start scan flow
  const handleStartScan = async () => {
    if (!user?.uid) {
      setError('You must be logged in to scan');
      return;
    }

    if (!weight || weight <= 0) {
      setError('Please enter your current weight');
      return;
    }

    try {
      setIsProcessing(true);
      const newScanId = await createScan(user.uid, weight, notes);
      setScanId(newScanId);
      setCurrentStep('capture');
      setError(null);
    } catch (err) {
      setError('Failed to start scan. Please try again.');
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle photo captured from camera
  const handlePhotoCaptured = (photoBlob: Blob) => {
    // Store blob for this angle
    const newPhotoBlobs = new Map(photoBlobs).set(currentAngle, photoBlob);
    setPhotoBlobs(newPhotoBlobs);

    // Find next angle
    const currentIndex = SCAN_ANGLE_ORDER.indexOf(currentAngle);
    if (currentIndex < SCAN_ANGLE_ORDER.length - 1) {
      // Move to next angle
      setCurrentAngle(SCAN_ANGLE_ORDER[currentIndex + 1]);
    } else {
      // All photos captured, start processing
      processScan(newPhotoBlobs);
    }
  };

  // Process scan with Gemini AI
  const processScan = async (blobs: Map<ScanAngle, Blob>) => {
    if (!scanId || !user?.uid) {
      setError('Scan session invalid. Please start over.');
      return;
    }

    try {
      setCurrentStep('upload');
      setIsProcessing(true);

      // Update scan status to uploading
      await updateScanStatus(scanId, 'uploading');

      // Upload photos to Firebase Storage with progress tracking
      const handleUploadProgress = (angle: ScanAngle, progress: number) => {
        setUploadProgress((prev) => new Map(prev).set(angle, progress));
      };

      const photos = await uploadAllScanPhotos(
        user.uid,
        scanId,
        blobs,
        handleUploadProgress
      );

      console.log('✅ All photos uploaded to Firebase Storage');

      // Move to processing step
      setCurrentStep('processing');
      await updateScanStatus(scanId, 'processing');

      // Analyze with Gemini
      const analysisRequest: GeminiVisionRequest = {
        photos,
        weight,
        userContext: {
          // TODO: Get user profile data from Firestore in future
          age: 30,
          gender: 'unknown',
          height: 175,
        },
      };

      const analysisResult = await analyzeBodyCompositionWithRetry(analysisRequest);

      if (!analysisResult.success || !analysisResult.bodyComposition) {
        throw new Error(analysisResult.errorMessage || 'Analysis failed');
      }

      // Calculate delta vs previous scan
      const previousScan = await getPreviousScan(user.uid, scanId);
      let delta = null;

      if (previousScan && previousScan.bodyComposition && analysisResult.bodyComposition) {
        // Create temporary scan object with current data for delta calculation
        const currentScanForDelta = {
          bodyComposition: analysisResult.bodyComposition,
          weight,
          createdAt: new Date(),
        };

        delta = calculateScanDelta(currentScanForDelta as any, previousScan);
        console.log('📊 Delta calculated:', delta);
      }

      // Save analysis results to Firestore
      await updateScanWithAnalysis(scanId, {
        bodyComposition: analysisResult.bodyComposition,
        qualityCheck: analysisResult.qualityCheck,
        delta: delta || undefined,
      });

      // Mark scan as completed
      await updateScanStatus(scanId, 'completed');

      // Update streak
      try {
        const streak = await updateStreak(user.uid);
        console.log('🔥 Streak updated:', streak.currentStreak, 'days');
      } catch (streakError) {
        console.error('Error updating streak:', streakError);
        // Don't fail the entire scan if streak update fails
      }

      // Move to results
      setCurrentStep('results');
      setIsProcessing(false);
    } catch (err) {
      console.error('Scan processing error:', err);
      setError('Failed to process scan. Please try again.');
      await updateScanStatus(scanId, 'failed', err instanceof Error ? err.message : 'Unknown error');
      setIsProcessing(false);
    }
  };

  // Handle scan completion
  const handleScanComplete = () => {
    if (scanId) {
      updateScanStatus(scanId, 'completed').then(() => {
        if (onComplete) {
          onComplete(scanId);
        } else {
          navigate(`/scan/results/${scanId}`);
        }
      });
    }
  };

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 'intro':
        return (
          <div className="space-y-6">
            {/* Header */}
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-full mb-4">
                <Camera className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-2">
                Daily Body Scan
              </h2>
              <p className="text-gray-600">
                Track your body composition with AI-powered precision
              </p>
            </div>

            {/* Already scanned today notice */}
            {hasScannedTodayState && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5" />
                  <div className="text-sm text-amber-700">
                    <p className="font-medium">You've already scanned today!</p>
                    <p className="mt-1">
                      For best results, scan once per day at the same time.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Instructions */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-blue-900 mb-3">
                What you'll need:
              </h3>
              <ul className="space-y-2 text-blue-700">
                <li className="flex items-start space-x-2">
                  <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                  <span>4 photos (front, back, left side, right side)</span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                  <span>Good lighting (natural light is best)</span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                  <span>Form-fitting clothing or undergarments</span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                  <span>About 2 minutes of your time</span>
                </li>
              </ul>
            </div>

            {/* Weight input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Current Weight (lbs) *
              </label>
              <input
                type="number"
                value={weight || ''}
                onChange={(e) => setWeight(parseFloat(e.target.value) || 0)}
                placeholder="Enter your weight"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                min="0"
                step="0.1"
              />
            </div>

            {/* Optional notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="How are you feeling today? Any changes to note?"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                rows={3}
              />
            </div>

            {/* Error message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex space-x-4">
              {onCancel && (
                <button
                  onClick={onCancel}
                  className="flex-1 px-6 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleStartScan}
                disabled={isProcessing || !weight || weight <= 0}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-primary-500 to-secondary-500 text-white rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Starting...</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-5 h-5" />
                    <span>Start Scan</span>
                  </>
                )}
              </button>
            </div>

            {/* Privacy notice */}
            <p className="text-xs text-gray-500 text-center">
              Your scan photos are private by default and never shared without your permission.
            </p>
          </div>
        );

      case 'capture':
        return (
          <div className="space-y-6">
            {/* Progress indicator */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-gray-900">
                  Capture {ANGLE_DISPLAY_NAMES[currentAngle]}
                </h3>
                <span className="text-sm text-gray-600">
                  {photoBlobs.size + 1} of 4
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-primary-500 to-secondary-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(photoBlobs.size / 4) * 100}%` }}
                />
              </div>
            </div>

            {/* Camera component */}
            <CameraCapture
              angle={currentAngle}
              onCapture={handlePhotoCaptured}
              onCancel={() => setCurrentStep('intro')}
            />
          </div>
        );

      case 'upload':
        const totalSize = getTotalPhotoSize(photoBlobs);

        return (
          <div className="space-y-6">
            {/* Header */}
            <div className="text-center">
              <Upload className="w-16 h-16 text-primary-500 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-gray-900">
                Uploading Your Photos
              </h3>
              <p className="text-gray-600">
                Securely uploading {formatBytes(totalSize)} to Firebase Storage
              </p>
            </div>

            {/* Progress for each angle */}
            <div className="space-y-4">
              {SCAN_ANGLE_ORDER.map((angle) => {
                const progress = uploadProgress.get(angle) || 0;
                const isComplete = progress >= 100;

                return (
                  <div key={angle} className="bg-white rounded-lg p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900">
                        {ANGLE_DISPLAY_NAMES[angle]}
                      </span>
                      <div className="flex items-center space-x-2">
                        {isComplete ? (
                          <>
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            <span className="text-sm text-green-600">Complete</span>
                          </>
                        ) : (
                          <span className="text-sm text-gray-600">{Math.round(progress)}%</span>
                        )}
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${
                          isComplete ? 'bg-green-500' : 'bg-primary-500'
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-700 text-center">
                🔒 Your photos are encrypted during upload and stored securely
              </p>
            </div>
          </div>
        );

      case 'processing':
        return (
          <div className="space-y-6 text-center">
            <Loader2 className="w-16 h-16 text-primary-500 mx-auto animate-spin" />
            <h3 className="text-2xl font-bold text-gray-900">
              Analyzing Your Body Composition...
            </h3>
            <p className="text-gray-600">
              Our AI is analyzing your photos. This typically takes 30-60 seconds.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-700">
                ✨ Using Gemini 2.0 Flash for precision analysis
              </p>
            </div>
          </div>
        );

      case 'results':
        return (
          <div className="space-y-6 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
            <h3 className="text-2xl font-bold text-gray-900">
              Scan Complete!
            </h3>
            <p className="text-gray-600">
              Your body composition has been analyzed
            </p>
            <button
              onClick={handleScanComplete}
              className="w-full px-6 py-3 bg-gradient-to-r from-primary-500 to-secondary-500 text-white rounded-lg font-medium hover:shadow-lg transition-all"
            >
              View Results
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="bg-white rounded-2xl shadow-xl p-8">
        {renderStepContent()}
      </div>
    </div>
  );
};

export default DailyScanWizard;
