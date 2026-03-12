/**
 * Progress Ring Component - Phase 5
 * Circular progress indicator for targets
 */
import React from 'react';

const ProgressRing = ({ 
  progress = 0, 
  size = 120, 
  strokeWidth = 8,
  color = '#3B82F6',
  bgColor = '#E5E7EB',
  showPercentage = true,
  showValue = false,
  value,
  target,
  label
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (Math.min(progress, 100) / 100) * circumference;
  const center = size / 2;

  const getColor = () => {
    if (progress >= 100) return '#10B981';
    if (progress >= 75) return '#3B82F6';
    if (progress >= 50) return '#F59E0B';
    if (progress >= 25) return '#F97316';
    return '#EF4444';
  };

  const ringColor = color === 'auto' ? getColor() : color;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={bgColor}
          strokeWidth={strokeWidth}
        />
        
        {/* Progress circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500 ease-out"
        />
      </svg>
      
      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {showPercentage && (
          <span className="text-2xl font-bold text-gray-900">
            {Math.round(progress)}%
          </span>
        )}
        {showValue && value !== undefined && (
          <>
            <span className="text-xl font-bold text-gray-900">{value}</span>
            <span className="text-xs text-gray-500">of {target}</span>
          </>
        )}
        {label && (
          <span className="text-xs text-gray-500 mt-1">{label}</span>
        )}
      </div>
    </div>
  );
};

export default ProgressRing;
