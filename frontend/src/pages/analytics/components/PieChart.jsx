/**
 * Pie Chart Component - Phase 5
 * Circular chart for showing proportions
 */
import React, { useState } from 'react';

const PieChart = ({ 
  data = [], 
  height = 250, 
  donut = false,
  showLegend = true,
  showLabels = false,
  showTooltip = true
}) => {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        No data available
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + (d.value || d.count || 0), 0);
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
  
  const radius = 80;
  const center = 100;
  const innerRadius = donut ? 50 : 0;
  const hoverScale = 1.05;

  let currentAngle = 0;

  const polarToCartesian = (cx, cy, r, angle) => {
    const rad = (angle - 90) * Math.PI / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad)
    };
  };

  const getPath = (startAngle, endAngle, isHovered = false) => {
    const r = isHovered ? radius * hoverScale : radius;
    const ir = isHovered ? innerRadius * hoverScale : innerRadius;
    
    const start = polarToCartesian(center, center, r, endAngle);
    const end = polarToCartesian(center, center, r, startAngle);
    const innerStart = polarToCartesian(center, center, ir, endAngle);
    const innerEnd = polarToCartesian(center, center, ir, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;

    if (donut) {
      return [
        'M', start.x, start.y,
        'A', r, r, 0, largeArcFlag, 0, end.x, end.y,
        'L', innerEnd.x, innerEnd.y,
        'A', ir, ir, 0, largeArcFlag, 1, innerStart.x, innerStart.y,
        'Z'
      ].join(' ');
    }

    return [
      'M', center, center,
      'L', start.x, start.y,
      'A', r, r, 0, largeArcFlag, 0, end.x, end.y,
      'Z'
    ].join(' ');
  };

  const getLabelPosition = (startAngle, endAngle) => {
    const midAngle = (startAngle + endAngle) / 2;
    const labelRadius = donut ? (radius + innerRadius) / 2 : radius * 0.6;
    return polarToCartesian(center, center, labelRadius, midAngle);
  };

  const slices = data.map((item, index) => {
    const value = item.value || item.count || 0;
    const angle = (value / total) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle += angle;

    return {
      ...item,
      value,
      angle,
      startAngle,
      endAngle,
      percentage: ((value / total) * 100).toFixed(1),
      color: item.color || colors[index % colors.length]
    };
  });

  return (
    <div className="flex items-center gap-6" style={{ height }}>
      {/* Chart */}
      <div className="relative">
        <svg viewBox="0 0 200 200" className="w-48 h-48">
          {slices.map((slice, index) => (
            <g key={index}>
              <path
                d={getPath(slice.startAngle, slice.endAngle, hoveredIndex === index)}
                fill={slice.color}
                stroke="white"
                strokeWidth="2"
                className="transition-all duration-200 cursor-pointer"
                style={{
                  opacity: hoveredIndex !== null && hoveredIndex !== index ? 0.5 : 1
                }}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
              
              {/* Labels on chart */}
              {showLabels && slice.percentage > 5 && (
                <text
                  x={getLabelPosition(slice.startAngle, slice.endAngle).x}
                  y={getLabelPosition(slice.startAngle, slice.endAngle).y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-xs font-medium fill-white pointer-events-none"
                >
                  {slice.percentage}%
                </text>
              )}
            </g>
          ))}

          {/* Center text for donut */}
          {donut && (
            <g>
              <text
                x={center}
                y={center - 5}
                textAnchor="middle"
                className="text-2xl font-bold fill-gray-700"
              >
                {hoveredIndex !== null ? slices[hoveredIndex].value : total}
              </text>
              <text
                x={center}
                y={center + 15}
                textAnchor="middle"
                className="text-xs fill-gray-500"
              >
                {hoveredIndex !== null ? slices[hoveredIndex].label || slices[hoveredIndex].name : 'Total'}
              </text>
            </g>
          )}
        </svg>

        {/* Tooltip */}
        {showTooltip && hoveredIndex !== null && !donut && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg pointer-events-none z-10 text-center">
            <div className="font-medium">{slices[hoveredIndex].label || slices[hoveredIndex].name}</div>
            <div className="text-gray-300">{slices[hoveredIndex].value.toLocaleString()}</div>
            <div className="text-gray-400">{slices[hoveredIndex].percentage}%</div>
          </div>
        )}
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="flex-1 space-y-2 overflow-y-auto" style={{ maxHeight: height }}>
          {slices.map((slice, index) => (
            <div
              key={index}
              className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                hoveredIndex === index ? 'bg-gray-100' : ''
              }`}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: slice.color }}
              />
              <span className="text-sm text-gray-700 truncate flex-1">
                {slice.label || slice.name}
              </span>
              <span className="text-sm font-medium text-gray-900">
                {slice.value.toLocaleString()}
              </span>
              <span className="text-xs text-gray-500">
                ({slice.percentage}%)
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PieChart;
