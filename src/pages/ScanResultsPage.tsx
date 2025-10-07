/**
 * Scan Results Page
 *
 * Displays the results of a completed body scan, including:
 * - Body composition metrics (BF%, LBM, weight)
 * - Comparison to previous scan
 * - AI-generated insights
 * - Progress trends
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingDown, TrendingUp, Minus, Loader2, Calendar } from 'lucide-react';
import { getScan } from '../lib/firestore/scans';
import { getPreviousScan, calculateScanDelta } from '../lib/firestore/scanHistory';
import type { Scan, ScanDelta } from '../types/scan';

const ScanResultsPage: React.FC = () => {
  const { scanId } = useParams<{ scanId: string }>();
  const navigate = useNavigate();

  const [scan, setScan] = useState<Scan | null>(null);
  const [delta, setDelta] = useState<ScanDelta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!scanId) {
      setError('No scan ID provided');
      setIsLoading(false);
      return;
    }

    const loadScan = async () => {
      try {
        setIsLoading(true);
        const scanData = await getScan(scanId);

        if (!scanData) {
          setError('Scan not found');
          return;
        }

        setScan(scanData);

        // Get previous scan for comparison
        if (scanData.userId) {
          const prevScan = await getPreviousScan(scanData.userId, scanId);
          if (prevScan) {
            const calculatedDelta = calculateScanDelta(scanData, prevScan);
            setDelta(calculatedDelta);
          }
        }
      } catch (err) {
        console.error('Error loading scan:', err);
        setError('Failed to load scan results');
      } finally {
        setIsLoading(false);
      }
    };

    loadScan();
  }, [scanId]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-16 h-16 text-primary-500 mx-auto animate-spin mb-4" />
          <p className="text-gray-600">Loading your results...</p>
        </div>
      </div>
    );
  }

  if (error || !scan) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Scan not found'}</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-6 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const bodyComp = scan.bodyComposition;

  const renderDeltaIcon = (value: number) => {
    if (value < -0.1) return <TrendingDown className="w-5 h-5 text-green-500" />;
    if (value > 0.1) return <TrendingUp className="w-5 h-5 text-red-500" />;
    return <Minus className="w-5 h-5 text-gray-400" />;
  };

  const formatDelta = (value: number, suffix: string) => {
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}${suffix}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50">
      {/* Header */}
      <div className="container mx-auto px-4 py-6">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Dashboard</span>
        </button>
      </div>

      {/* Results */}
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Success banner */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-2xl p-8 mb-8 text-center">
          <h1 className="text-3xl font-bold mb-2">Scan Complete! 🎉</h1>
          <p className="text-green-100">
            Your body composition has been analyzed with AI precision
          </p>
        </div>

        {/* Body Composition Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Body Fat % */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-sm font-medium text-gray-600 mb-2">Body Fat %</h3>
            <div className="flex items-baseline space-x-2">
              <p className="text-4xl font-bold text-gray-900">
                {bodyComp?.bodyFatPercent.toFixed(1) || '--'}%
              </p>
              {delta && (
                <div className="flex items-center space-x-1 text-sm">
                  {renderDeltaIcon(delta.bodyFatDelta)}
                  <span className={delta.bodyFatDelta < 0 ? 'text-green-600' : 'text-red-600'}>
                    {formatDelta(delta.bodyFatDelta, '%')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Lean Body Mass */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-sm font-medium text-gray-600 mb-2">Lean Mass</h3>
            <div className="flex items-baseline space-x-2">
              <p className="text-4xl font-bold text-gray-900">
                {bodyComp?.leanBodyMass.toFixed(1) || '--'}
              </p>
              <span className="text-xl text-gray-600">lbs</span>
              {delta && (
                <div className="flex items-center space-x-1 text-sm ml-2">
                  {renderDeltaIcon(-delta.leanMassDelta)} {/* Invert: gain is good */}
                  <span className={delta.leanMassDelta > 0 ? 'text-green-600' : 'text-red-600'}>
                    {formatDelta(delta.leanMassDelta, ' lbs')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Total Weight */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-sm font-medium text-gray-600 mb-2">Total Weight</h3>
            <div className="flex items-baseline space-x-2">
              <p className="text-4xl font-bold text-gray-900">
                {scan.weight.toFixed(1)}
              </p>
              <span className="text-xl text-gray-600">lbs</span>
              {delta && (
                <div className="flex items-center space-x-1 text-sm ml-2">
                  {renderDeltaIcon(delta.weightDelta)}
                  <span className={delta.weightDelta < 0 ? 'text-green-600' : 'text-red-600'}>
                    {formatDelta(delta.weightDelta, ' lbs')}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Progress indicator */}
        {delta && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Progress Trend</h3>
                <p className="text-gray-600">
                  Compared to {delta.daysSinceLastScan} day{delta.daysSinceLastScan !== 1 ? 's' : ''} ago
                </p>
              </div>
              <div className={`px-4 py-2 rounded-full font-medium ${
                delta.trend === 'improving' ? 'bg-green-100 text-green-700' :
                delta.trend === 'declining' ? 'bg-red-100 text-red-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {delta.trend === 'improving' ? '📈 Improving' :
                 delta.trend === 'declining' ? '📉 Needs Attention' :
                 '➡️ Stable'}
              </div>
            </div>
          </div>
        )}

        {/* AI Insights Placeholder */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl shadow-lg p-6 mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">AI Insights</h3>
          <div className="space-y-4">
            <p className="text-gray-700">
              <strong>Progress Analysis:</strong> AI-generated insights will appear here after full integration.
            </p>
            <p className="text-gray-700">
              <strong>Nutrition Recommendation:</strong> Personalized meal suggestions based on your goals.
            </p>
            <p className="text-gray-700">
              <strong>Workout Recommendation:</strong> Training adjustments to optimize results.
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex space-x-4">
          <button
            onClick={() => navigate('/scan/history')}
            className="flex-1 px-6 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors flex items-center justify-center space-x-2"
          >
            <Calendar className="w-5 h-5" />
            <span>View History</span>
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-primary-500 to-secondary-500 text-white rounded-lg font-medium hover:shadow-lg transition-all"
          >
            Back to Dashboard
          </button>
        </div>

        {/* Notes */}
        {scan.notes && (
          <div className="mt-8 bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Your Notes</h3>
            <p className="text-gray-700">{scan.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScanResultsPage;
