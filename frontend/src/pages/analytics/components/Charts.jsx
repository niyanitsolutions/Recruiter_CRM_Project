/**
 * Chart Components - Phase 5
 * Reusable chart components for analytics
 */
import React from 'react';

// ============== Trend Chart ==============
export const TrendChart = ({ data = [], height = 280, color = '#3B82F6', showArea = false }) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        No data available
      </div>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value || d.count || 0));
  const minValue = Math.min(...data.map(d => d.value || d.count || 0));
  const range = maxValue - minValue || 1;
  
  const width = 100;
  const chartHeight = 100;
  const padding = 10;

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * (width - 2 * padding);
    const y = chartHeight - padding - ((d.value || d.count || 0) - minValue) / range * (chartHeight - 2 * padding);
    return `${x},${y}`;
  }).join(' ');

  const areaPoints = `${padding},${chartHeight - padding} ${points} ${width - padding},${chartHeight - padding}`;

  return (
    <div style={{ height }}>
      <svg viewBox={`0 0 ${width} ${chartHeight}`} className="w-full h-full">
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map(y => (
          <line
            key={y}
            x1={padding}
            y1={padding + (y / 100) * (chartHeight - 2 * padding)}
            x2={width - padding}
            y2={padding + (y / 100) * (chartHeight - 2 * padding)}
            stroke="#E5E7EB"
            strokeWidth="0.5"
          />
        ))}
        
        {/* Area fill */}
        {showArea && (
          <polygon
            points={areaPoints}
            fill={color}
            fillOpacity="0.1"
          />
        )}
        
        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Data points */}
        {data.map((d, i) => {
          const x = padding + (i / (data.length - 1)) * (width - 2 * padding);
          const y = chartHeight - padding - ((d.value || d.count || 0) - minValue) / range * (chartHeight - 2 * padding);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="1.5"
              fill={color}
            />
          );
        })}
      </svg>
      
      {/* X-axis labels */}
      <div className="flex justify-between px-2 mt-2 text-xs text-gray-500">
        {data.length > 0 && (
          <>
            <span>{data[0].label || data[0].date}</span>
            {data.length > 2 && <span>{data[Math.floor(data.length / 2)].label || data[Math.floor(data.length / 2)].date}</span>}
            <span>{data[data.length - 1].label || data[data.length - 1].date}</span>
          </>
        )}
      </div>
    </div>
  );
};

// ============== Funnel Chart ==============
export const FunnelChart = ({ data = [], height = 280 }) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        No data available
      </div>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value || d.count || 0));
  const colors = ['#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF'];

  return (
    <div style={{ height }} className="flex flex-col justify-center space-y-2">
      {data.map((item, index) => {
        const value = item.value || item.count || 0;
        const percentage = maxValue ? (value / maxValue * 100) : 0;
        const prevValue = index > 0 ? (data[index - 1].value || data[index - 1].count || 0) : null;
        const conversionRate = prevValue ? ((value / prevValue) * 100).toFixed(1) : null;
        
        return (
          <div key={index} className="flex items-center gap-3">
            <div className="w-24 text-right">
              <span className="text-sm font-medium text-gray-700">{item.label || item.stage}</span>
            </div>
            <div className="flex-1">
              <div className="relative h-8 bg-gray-100 rounded-lg overflow-hidden">
                <div
                  className="h-full rounded-lg transition-all duration-500 flex items-center justify-end pr-2"
                  style={{
                    width: `${Math.max(percentage, 5)}%`,
                    backgroundColor: colors[index % colors.length]
                  }}
                >
                  <span className="text-xs font-semibold text-white">{value}</span>
                </div>
              </div>
            </div>
            <div className="w-16 text-left">
              {conversionRate && (
                <span className="text-xs text-gray-500">{conversionRate}%</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ============== Pie Chart ==============
export const PieChart = ({ data = [], height = 250, donut = false }) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        No data available
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + (d.value || d.count || 0), 0);
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
  
  let currentAngle = 0;
  const radius = 80;
  const center = 100;
  const innerRadius = donut ? 50 : 0;

  const getPath = (startAngle, endAngle) => {
    const start = polarToCartesian(center, center, radius, endAngle);
    const end = polarToCartesian(center, center, radius, startAngle);
    const innerStart = polarToCartesian(center, center, innerRadius, endAngle);
    const innerEnd = polarToCartesian(center, center, innerRadius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;

    if (donut) {
      return [
        'M', start.x, start.y,
        'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y,
        'L', innerEnd.x, innerEnd.y,
        'A', innerRadius, innerRadius, 0, largeArcFlag, 1, innerStart.x, innerStart.y,
        'Z'
      ].join(' ');
    }

    return [
      'M', center, center,
      'L', start.x, start.y,
      'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y,
      'Z'
    ].join(' ');
  };

  const polarToCartesian = (cx, cy, r, angle) => {
    const rad = (angle - 90) * Math.PI / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad)
    };
  };

  return (
    <div style={{ height }} className="flex items-center gap-4">
      <svg viewBox="0 0 200 200" className="w-1/2 h-full">
        {data.map((item, index) => {
          const value = item.value || item.count || 0;
          const angle = (value / total) * 360;
          const path = getPath(currentAngle, currentAngle + angle);
          currentAngle += angle;
          
          return (
            <path
              key={index}
              d={path}
              fill={item.color || colors[index % colors.length]}
              stroke="white"
              strokeWidth="2"
              className="transition-opacity hover:opacity-80 cursor-pointer"
            />
          );
        })}
        {donut && (
          <text x={center} y={center} textAnchor="middle" dy="0.35em" className="text-lg font-bold fill-gray-700">
            {total}
          </text>
        )}
      </svg>
      
      {/* Legend */}
      <div className="w-1/2 space-y-2">
        {data.slice(0, 6).map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: item.color || colors[index % colors.length] }}
            />
            <span className="text-sm text-gray-600 truncate">{item.label || item.name}</span>
            <span className="text-sm font-medium text-gray-900 ml-auto">
              {item.value || item.count || 0}
            </span>
          </div>
        ))}
        {data.length > 6 && (
          <p className="text-xs text-gray-400">+{data.length - 6} more</p>
        )}
      </div>
    </div>
  );
};

// ============== Bar Chart ==============
export const BarChart = ({ data = [], height = 250, horizontal = false, color = '#3B82F6' }) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        No data available
      </div>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value || d.count || 0));
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

  if (horizontal) {
    return (
      <div style={{ height }} className="flex flex-col justify-center space-y-3">
        {data.slice(0, 5).map((item, index) => {
          const value = item.value || item.count || 0;
          const percentage = maxValue ? (value / maxValue * 100) : 0;
          
          return (
            <div key={index} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 truncate">{item.label || item.name}</span>
                <span className="font-medium text-gray-900">{value.toLocaleString()}</span>
              </div>
              <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.max(percentage, 2)}%`,
                    backgroundColor: colors[index % colors.length]
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ height }} className="flex items-end justify-around gap-2 pt-4">
      {data.slice(0, 8).map((item, index) => {
        const value = item.value || item.count || 0;
        const percentage = maxValue ? (value / maxValue * 100) : 0;
        
        return (
          <div key={index} className="flex flex-col items-center gap-1 flex-1">
            <span className="text-xs font-medium text-gray-700">{value}</span>
            <div className="w-full bg-gray-100 rounded-t-lg" style={{ height: height - 60 }}>
              <div
                className="w-full rounded-t-lg transition-all duration-500"
                style={{
                  height: `${Math.max(percentage, 2)}%`,
                  backgroundColor: colors[index % colors.length],
                  marginTop: `${100 - Math.max(percentage, 2)}%`
                }}
              />
            </div>
            <span className="text-xs text-gray-500 truncate w-full text-center">
              {(item.label || item.name || '').substring(0, 8)}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default { TrendChart, FunnelChart, PieChart, BarChart };
