/**
 * KPI Card Component - Phase 5
 * Displays a single KPI metric with trend indicator
 */
import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const KPICard = ({
  title,
  value,
  trend,
  trendValue,
  icon: Icon,
  color = 'blue',
  size = 'normal',
  isCurrency = false,
  isPositiveGood = true
}) => {
  const colorClasses = {
    blue: {
      bg: 'bg-blue-50',
      icon: 'bg-blue-100 text-blue-600',
      trend: 'text-blue-600'
    },
    green: {
      bg: 'bg-green-50',
      icon: 'bg-green-100 text-green-600',
      trend: 'text-green-600'
    },
    purple: {
      bg: 'bg-purple-50',
      icon: 'bg-purple-100 text-purple-600',
      trend: 'text-purple-600'
    },
    orange: {
      bg: 'bg-orange-50',
      icon: 'bg-orange-100 text-orange-600',
      trend: 'text-orange-600'
    },
    indigo: {
      bg: 'bg-indigo-50',
      icon: 'bg-indigo-100 text-indigo-600',
      trend: 'text-indigo-600'
    },
    yellow: {
      bg: 'bg-yellow-50',
      icon: 'bg-yellow-100 text-yellow-600',
      trend: 'text-yellow-600'
    },
    teal: {
      bg: 'bg-teal-50',
      icon: 'bg-teal-100 text-teal-600',
      trend: 'text-teal-600'
    },
    pink: {
      bg: 'bg-pink-50',
      icon: 'bg-pink-100 text-pink-600',
      trend: 'text-pink-600'
    }
  };

  const colors = colorClasses[color] || colorClasses.blue;

  const getTrendIcon = () => {
    if (trend === 'up') return TrendingUp;
    if (trend === 'down') return TrendingDown;
    return Minus;
  };

  const getTrendColor = () => {
    if (trend === 'up') {
      return isPositiveGood ? 'text-green-600' : 'text-red-600';
    }
    if (trend === 'down') {
      return isPositiveGood ? 'text-red-600' : 'text-green-600';
    }
    return 'text-gray-500';
  };

  const TrendIcon = getTrendIcon();

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 ${size === 'small' ? 'p-4' : 'p-6'} hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className={`text-gray-500 ${size === 'small' ? 'text-xs' : 'text-sm'} font-medium`}>
            {title}
          </p>
          <p className={`font-bold text-gray-900 mt-1 ${size === 'small' ? 'text-xl' : 'text-2xl'}`}>
            {value}
          </p>
          
          {/* Trend */}
          {(trend || trendValue !== undefined) && (
            <div className={`flex items-center mt-2 ${getTrendColor()}`}>
              <TrendIcon className="w-4 h-4 mr-1" />
              <span className="text-sm font-medium">
                {trendValue !== undefined ? (
                  <>
                    {Math.abs(trendValue)}%
                    <span className="text-gray-400 ml-1 font-normal">vs last period</span>
                  </>
                ) : (
                  trend === 'up' ? 'Increasing' : trend === 'down' ? 'Decreasing' : 'Stable'
                )}
              </span>
            </div>
          )}
        </div>
        
        {/* Icon */}
        {Icon && (
          <div className={`${colors.icon} ${size === 'small' ? 'p-2' : 'p-3'} rounded-xl`}>
            <Icon className={size === 'small' ? 'w-5 h-5' : 'w-6 h-6'} />
          </div>
        )}
      </div>
    </div>
  );
};

export default KPICard;
