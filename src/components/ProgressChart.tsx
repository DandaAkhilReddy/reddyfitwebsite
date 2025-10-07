/**
 * Progress Chart Component
 *
 * Visualizes body composition trends over time using Recharts.
 */

import React from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';
import type { Scan } from '../types/scan';

interface ProgressChartProps {
  scans: Scan[];
  metric?: 'bodyFat' | 'weight' | 'leanMass' | 'all';
  chartType?: 'line' | 'area';
}

const ProgressChart: React.FC<ProgressChartProps> = ({
  scans,
  metric = 'all',
  chartType = 'area',
}) => {
  // Prepare chart data
  const chartData = scans
    .filter((scan) => scan.bodyComposition && scan.createdAt)
    .reverse() // Oldest first for chart
    .map((scan) => {
      const date = scan.createdAt;
      const dateObj = (date as any)?.toDate ? (date as any).toDate() : new Date(date);

      return {
        date: format(dateObj, 'MMM d'),
        fullDate: format(dateObj, 'MMM d, yyyy'),
        bodyFat: scan.bodyComposition?.bodyFatPercent || 0,
        weight: scan.weight || 0,
        leanMass: scan.bodyComposition?.leanBodyMass || 0,
      };
    });

  if (chartData.length === 0) {
    return (
      <div className="bg-gray-50 rounded-xl p-12 text-center">
        <p className="text-gray-600">
          Not enough data to display chart. Complete at least 2 scans to see trends.
        </p>
      </div>
    );
  }

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-4">
          <p className="text-sm font-semibold text-gray-900 mb-2">
            {payload[0].payload.fullDate}
          </p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              <span className="font-medium">{entry.name}:</span>{' '}
              {entry.value.toFixed(1)}
              {entry.name === 'Body Fat %' ? '%' : ' lbs'}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const ChartComponent = chartType === 'area' ? AreaChart : LineChart;

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Progress Over Time</h3>

      <ResponsiveContainer width="100%" height={300}>
        <ChartComponent
          data={chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="date"
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
          />
          <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: '14px' }}
            iconType="circle"
          />

          {(metric === 'bodyFat' || metric === 'all') && (
            chartType === 'area' ? (
              <Area
                type="monotone"
                dataKey="bodyFat"
                name="Body Fat %"
                stroke="#ef4444"
                fill="#fee2e2"
                strokeWidth={2}
              />
            ) : (
              <Line
                type="monotone"
                dataKey="bodyFat"
                name="Body Fat %"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ fill: '#ef4444', r: 4 }}
              />
            )
          )}

          {(metric === 'weight' || metric === 'all') && (
            chartType === 'area' ? (
              <Area
                type="monotone"
                dataKey="weight"
                name="Weight"
                stroke="#3b82f6"
                fill="#dbeafe"
                strokeWidth={2}
              />
            ) : (
              <Line
                type="monotone"
                dataKey="weight"
                name="Weight"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: '#3b82f6', r: 4 }}
              />
            )
          )}

          {(metric === 'leanMass' || metric === 'all') && (
            chartType === 'area' ? (
              <Area
                type="monotone"
                dataKey="leanMass"
                name="Lean Mass"
                stroke="#10b981"
                fill="#d1fae5"
                strokeWidth={2}
              />
            ) : (
              <Line
                type="monotone"
                dataKey="leanMass"
                name="Lean Mass"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ fill: '#10b981', r: 4 }}
              />
            )
          )}
        </ChartComponent>
      </ResponsiveContainer>

      {/* Chart legend help */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex flex-wrap gap-4 text-xs text-gray-600">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span>Body Fat % (goal: decrease)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <span>Weight (total body weight)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span>Lean Mass (muscle + bone)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProgressChart;
