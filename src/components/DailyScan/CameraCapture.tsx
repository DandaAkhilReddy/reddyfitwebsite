/**
 * Camera Capture Component
 *
 * Captures photos using the device's camera for body scans.
 * Supports front/back camera switching and displays pose instructions.
 */

import React, { useRef, useState, useEffect } from 'react';
import { Camera, FlipHorizontal, X, Loader2, AlertCircle } from 'lucide-react';
import type { ScanAngle } from '../../types/scan';
import { ANGLE_DISPLAY_NAMES, POSE_INSTRUCTIONS } from '../../types/scan';

interface CameraCaptureProps {
  angle: ScanAngle;
  onCapture: (photoBlob: Blob) => void;
  onCancel?: () => void;
}

const CameraCapture: React.FC<CameraCaptureProps> = ({
  angle,
  onCapture,
  onCancel,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isCapturing, setIsCapturing] = useState(false);

  // Initialize camera
  useEffect(() => {
    startCamera();

    return () => {
      stopCamera();
    };
  }, [facingMode]);

  const startCamera = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Stop any existing stream
      stopCamera();

      // Request camera access
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Attach stream to video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setIsLoading(false);
        };
      }
    } catch (err) {
      console.error('Error accessing camera:', err);

      if (err instanceof Error) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError('Camera permission denied. Please allow camera access in your browser settings.');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setError('No camera found. Please ensure your device has a camera.');
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          setError('Camera is already in use by another application.');
        } else {
          setError(`Camera error: ${err.message}`);
        }
      } else {
        setError('Failed to access camera. Please check your permissions.');
      }

      setIsLoading(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const flipCamera = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) {
      setError('Camera not ready. Please wait.');
      return;
    }

    try {
      setIsCapturing(true);

      const video = videoRef.current;
      const canvas = canvasRef.current;

      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw video frame to canvas
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not get canvas context');
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert canvas to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to create image blob'));
            }
          },
          'image/jpeg',
          0.9 // Quality (0-1)
        );
      });

      // Compress if needed (basic compression for now)
      const compressedBlob = await compressImage(blob);

      // Call onCapture callback
      onCapture(compressedBlob);

      setIsCapturing(false);
    } catch (err) {
      console.error('Error capturing photo:', err);
      setError('Failed to capture photo. Please try again.');
      setIsCapturing(false);
    }
  };

  // Basic image compression
  const compressImage = async (blob: Blob): Promise<Blob> => {
    // For now, just return the blob
    // TODO: Add more sophisticated compression in Phase 16-18
    const maxSize = 2 * 1024 * 1024; // 2MB max

    if (blob.size <= maxSize) {
      return blob;
    }

    // If too large, reduce quality
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve(blob);
          return;
        }

        // Resize if needed
        let width = img.width;
        let height = img.height;
        const maxDimension = 1920;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = (height / width) * maxDimension;
            width = maxDimension;
          } else {
            width = (width / height) * maxDimension;
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (compressedBlob) => {
            if (compressedBlob) {
              resolve(compressedBlob);
            } else {
              resolve(blob);
            }
          },
          'image/jpeg',
          0.8 // Lower quality for compression
        );
      };

      img.onerror = () => resolve(blob);
      img.src = URL.createObjectURL(blob);
    });
  };

  if (error) {
    return (
      <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-[3/4]">
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Camera Error</h3>
            <p className="text-gray-300 mb-6">{error}</p>
            <div className="flex space-x-4 justify-center">
              <button
                onClick={startCamera}
                className="px-6 py-3 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-colors"
              >
                Retry
              </button>
              {onCancel && (
                <button
                  onClick={onCancel}
                  className="px-6 py-3 bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative bg-gray-900 rounded-lg overflow-hidden">
      {/* Video Stream */}
      <div className="relative aspect-[3/4]">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          autoPlay
          playsInline
          muted
        />

        {/* Hidden canvas for photo capture */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-gray-900 bg-opacity-90 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-12 h-12 text-primary-500 mx-auto animate-spin mb-4" />
              <p className="text-white font-medium">Starting camera...</p>
            </div>
          </div>
        )}

        {/* Pose guide overlay */}
        {!isLoading && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Top instruction banner */}
            <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent p-6">
              <div className="text-center">
                <h3 className="text-white font-semibold text-lg mb-1">
                  {ANGLE_DISPLAY_NAMES[angle]}
                </h3>
                <p className="text-gray-300 text-sm">
                  {POSE_INSTRUCTIONS[angle]}
                </p>
              </div>
            </div>

            {/* Body outline guide (simple version for MVP) */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="border-2 border-dashed border-white/30 rounded-lg w-4/5 h-4/5 flex items-center justify-center">
                <div className="text-white/20 text-center">
                  <p className="text-sm font-medium">Position yourself here</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Controls overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-6">
          <div className="flex items-center justify-between">
            {/* Cancel button */}
            {onCancel && (
              <button
                onClick={onCancel}
                className="p-3 bg-gray-800/80 text-white rounded-full hover:bg-gray-700 transition-colors"
                aria-label="Cancel"
              >
                <X className="w-6 h-6" />
              </button>
            )}

            {/* Capture button */}
            <button
              onClick={capturePhoto}
              disabled={isLoading || isCapturing}
              className="mx-auto p-6 bg-white rounded-full shadow-lg hover:bg-gray-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Capture photo"
            >
              {isCapturing ? (
                <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
              ) : (
                <Camera className="w-8 h-8 text-gray-900" />
              )}
            </button>

            {/* Flip camera button */}
            <button
              onClick={flipCamera}
              disabled={isLoading}
              className="p-3 bg-gray-800/80 text-white rounded-full hover:bg-gray-700 transition-colors disabled:opacity-50"
              aria-label="Flip camera"
            >
              <FlipHorizontal className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="bg-gray-800 p-4">
        <div className="flex items-start space-x-3">
          <Camera className="w-5 h-5 text-primary-500 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-gray-300">
            <p className="font-medium text-white mb-1">Tips for best results:</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>Stand 6-8 feet away from camera</li>
              <li>Use good lighting (natural light is best)</li>
              <li>Wear form-fitting clothing</li>
              <li>Stand straight with arms at your sides</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CameraCapture;
