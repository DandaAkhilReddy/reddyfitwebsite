/**
 * Daily Scan Page
 *
 * Main entry point for the daily body scan feature.
 * Displays the scan wizard and handles navigation after completion.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import DailyScanWizard from '../components/DailyScan/DailyScanWizard';

const DailyScanPage: React.FC = () => {
  const navigate = useNavigate();

  const handleScanComplete = (scanId: string) => {
    // Navigate to results page
    navigate(`/scan/results/${scanId}`);
  };

  const handleCancel = () => {
    // Navigate back to dashboard
    navigate('/dashboard');
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

      {/* Wizard */}
      <div className="container mx-auto px-4 py-8">
        <DailyScanWizard onComplete={handleScanComplete} onCancel={handleCancel} />
      </div>

      {/* Footer help text */}
      <div className="container mx-auto px-4 py-6 text-center">
        <p className="text-sm text-gray-500">
          Need help? Contact{' '}
          <a href="mailto:support@reddyfit.club" className="text-primary-500 hover:underline">
            support@reddyfit.club
          </a>
        </p>
      </div>
    </div>
  );
};

export default DailyScanPage;
