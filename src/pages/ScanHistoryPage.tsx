/**
 * Scan History Page
 *
 * Displays a timeline of all user scans with progress tracking.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  TrendingDown,
  TrendingUp,
  Minus,
  Loader2,
  Camera,
  Flame,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getCompletedScans } from '../lib/firestore/scans';
import { getCurrentStreak, getScanHistorySummary } from '../lib/firestore/scanHistory';
import type { Scan, ScanStreak, ScanHistorySummary } from '../types/scan';
import { format } from 'date-fns';
import ProgressChart from '../components/ProgressChart';

const ScanHistoryPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [scans, setScans] = useState<Scan[]>([]);
  const [streak, setStreak] = useState<ScanStreak | null>(null);
  const [summary, setSummary] = useState<ScanHistorySummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setError('You must be logged in to view scan history');
      setIsLoading(false);
      return;
    }

    const loadHistory = async () => {
      try {
        setIsLoading(true);

        // Load scans, streak, and summary in parallel
        const [scansData, streakData, summaryData] = await Promise.all([
          getCompletedScans(user.uid, 50),
          getCurrentStreak(user.uid),
          getScanHistorySummary(user.uid),
        ]);

        setScans(scansData);
        setStreak(streakData);
        setSummary(summaryData);
        setIsLoading(false);
      } catch (err) {
        console.error('Error loading scan history:', err);
        setError('Failed to load scan history');
        setIsLoading(false);
      }
    };

    loadHistory();
  }, [user?.uid]);

  const renderDeltaIcon = (value: number) => {
    if (value < -0.1) return <TrendingDown className="w-4 h-4 text-green-500" />;
    if (value > 0.1) return <TrendingUp className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  const formatDelta = (value: number, suffix: string) => {
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}${suffix}`;
  };

  const formatScanDate = (date: any): string => {
    try {
      const dateObj = date?.toDate ? date.toDate() : new Date(date);
      return format(dateObj, 'MMM d, yyyy');
    } catch {
      return 'Unknown date';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-16 h-16 text-primary-500 mx-auto animate-spin mb-4" />
          <p className="text-gray-600">Loading your scan history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50">
      {/* Header */}
      <div className="container mx-auto px-4 py-6">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Dashboard</span>
        </button>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">Scan History</h1>
        <p className="text-gray-600">Track your body composition progress over time</p>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="container mx-auto px-4 py-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Total Scans */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center space-x-3 mb-2">
                <Camera className="w-6 h-6 text-primary-500" />
                <h3 className="text-sm font-medium text-gray-600">Total Scans</h3>
              </div>
              <p className="text-3xl font-bold text-gray-900">{summary.totalScans}</p>
            </div>

            {/* Current Streak */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center space-x-3 mb-2">
                <Flame className="w-6 h-6 text-orange-500" />
                <h3 className="text-sm font-medium text-gray-600">Current Streak</h3>
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {streak?.currentStreak || 0}{' '}
                <span className="text-lg text-gray-600">days</span>
              </p>
            </div>

            {/* Average BF% */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center space-x-3 mb-2">
                <TrendingDown className="w-6 h-6 text-green-500" />
                <h3 className="text-sm font-medium text-gray-600">Avg Body Fat</h3>
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {summary.averageBF.toFixed(1)}%
              </p>
            </div>

            {/* Total BF Lost */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center space-x-3 mb-2">
                <TrendingUp className="w-6 h-6 text-blue-500" />
                <h3 className="text-sm font-medium text-gray-600">Total BF Lost</h3>
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {Math.abs(summary.totalBFLost).toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Progress Chart */}
      {scans.length >= 2 && (
        <div className="container mx-auto px-4 py-6">
          <ProgressChart scans={scans} metric="all" chartType="area" />
        </div>
      )}

      {/* Scan Timeline */}
      <div className="container mx-auto px-4 py-6">
        {scans.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <Camera className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Scans Yet</h3>
            <p className="text-gray-600 mb-6">
              Start your fitness journey by completing your first daily scan
            </p>
            <button
              onClick={() => navigate('/scan')}
              className="px-6 py-3 bg-gradient-to-r from-primary-500 to-secondary-500 text-white rounded-lg font-medium hover:shadow-lg transition-all"
            >
              Take Your First Scan
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {scans.map((scan) => (
              <div
                key={scan.id}
                className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow cursor-pointer"
                onClick={() => navigate(`/scan/results/${scan.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-3">
                      <Calendar className="w-5 h-5 text-gray-600" />
                      <span className="text-lg font-semibold text-gray-900">
                        {formatScanDate(scan.createdAt)}
                      </span>
                      {scan.delta && (
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-medium ${
                            scan.delta.trend === 'improving'
                              ? 'bg-green-100 text-green-700'
                              : scan.delta.trend === 'declining'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {scan.delta.trend === 'improving'
                            ? '📈 Improving'
                            : scan.delta.trend === 'declining'
                            ? '📉 Attention'
                            : '➡️ Stable'}
                        </span>
                      )}
                    </div>

                    {scan.bodyComposition && (
                      <div className="grid grid-cols-3 gap-4">
                        {/* Body Fat % */}
                        <div>
                          <p className="text-sm text-gray-600 mb-1">Body Fat</p>
                          <div className="flex items-center space-x-2">
                            <p className="text-2xl font-bold text-gray-900">
                              {scan.bodyComposition.bodyFatPercent.toFixed(1)}%
                            </p>
                            {scan.delta && renderDeltaIcon(scan.delta.bodyFatDelta)}
                            {scan.delta && (
                              <span className="text-sm text-gray-600">
                                {formatDelta(scan.delta.bodyFatDelta, '%')}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Lean Mass */}
                        <div>
                          <p className="text-sm text-gray-600 mb-1">Lean Mass</p>
                          <div className="flex items-center space-x-2">
                            <p className="text-2xl font-bold text-gray-900">
                              {scan.bodyComposition.leanBodyMass.toFixed(1)} lbs
                            </p>
                          </div>
                        </div>

                        {/* Weight */}
                        <div>
                          <p className="text-sm text-gray-600 mb-1">Weight</p>
                          <div className="flex items-center space-x-2">
                            <p className="text-2xl font-bold text-gray-900">
                              {scan.weight.toFixed(1)} lbs
                            </p>
                            {scan.delta && renderDeltaIcon(scan.delta.weightDelta)}
                          </div>
                        </div>
                      </div>
                    )}

                    {scan.notes && (
                      <p className="mt-3 text-sm text-gray-600 italic">"{scan.notes}"</p>
                    )}
                  </div>

                  <ArrowLeft className="w-5 h-5 text-gray-400 transform rotate-180 ml-4" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ScanHistoryPage;
