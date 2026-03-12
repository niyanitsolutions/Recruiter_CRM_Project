/**
 * Trend Chart Component - Phase 5
 * Line chart for showing trends over time
 */
import React, { useState } from 'react';

const TrendChart = ({ 
  data = [], 
  height = 280, 
  color = '#3B82F6', 
  showArea = true,
  showPoints = true,
  showGrid = true,
  showTooltip = true,
  comparison = null
}) => {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        No trend data available
      </div>
    );
  }

  const values = data.map(d => d.value || d.count || 0);
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  const range = maxValue - minValue || 1;

  const chartWidth = 100;
  const chartHeight = 60;
  const padding = 5;

  const getPoint = (value, index) => {
    const x = padding + (index / (data.length - 1)) * (chartWidth - 2 * padding);
    const y = chartHeight - padding - ((value - minValue) / range) * (chartHeight - 2 * padding);
    return { x, y };
  };

  const points = data.map((d, i) => getPoint(d.value || d.count || 0, i));
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L ${points[points.length - 1].x} ${chartHeight - padding} L ${padding} ${chartHeight - padding} Z`;

  // Comparison line if provided
  let comparisonPoints = [];
  let comparisonPathD = '';
  if (comparison && comparison.length === data.length) {
    comparisonPoints = comparison.map((d, i) => getPoint(d.value || d.count || 0, i));
    comparisonPathD = comparisonPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  }

  return (
    <div style={{ height }} className="relative">
      <svg 
        viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
        className="w-full h-full"
        preserveAspectRatio="none"
      >
        {/* Grid lines */}
        {showGrid && [0, 25, 50, 75, 100].map(pct => {
          const y = chartHeight - padding - (pct / 100) * (chartHeight - 2 * padding);
          return (
            <line
              key={pct}
              x1={padding}
              y1={y}
              x2={chartWidth - padding}
              y2={y}
              stroke="#E5E7EB"
              strokeWidth="0.3"
            />
          );
        })}

        {/* Area fill */}
        {showArea && (
          <path
            d={areaD}
            fill={color}
            fillOpacity="0.1"
          />
        )}

        {/* Comparison line */}
        {comparisonPathD && (
          <path
            d={comparisonPathD}
            fill="none"
            stroke="#9CA3AF"
            strokeWidth="1"
            strokeDasharray="2,2"
          />
        )}

        {/* Main line */}
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {showPoints && points.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={hoveredIndex === i ? "2" : "1.2"}
              fill={color}
              className="transition-all"
            />
            {/* Hover area */}
            <rect
              x={p.x - 3}
              y={0}
              width={6}
              height={chartHeight}
              fill="transparent"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              className="cursor-pointer"
            />
          </g>
        ))}

        {/* Hover line */}
        {hoveredIndex !== null && (
          <line
            x1={points[hoveredIndex].x}
            y1={padding}
            x2={points[hoveredIndex].x}
            y2={chartHeight - padding}
            stroke={color}
            strokeWidth="0.5"
            strokeDasharray="2,2"
          />
        )}
      </svg>

      {/* Tooltip */}
      {showTooltip && hoveredIndex !== null && (
        <div
          className="absolute bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg pointer-events-none z-10"
          style={{
            left: `${(points[hoveredIndex].x / chartWidth) * 100}%`,
            top: `${(points[hoveredIndex].y / chartHeight) * 100 - 15}%`,
            transform: 'translateX(-50%)'
          }}
        >
          <div className="font-medium">{data[hoveredIndex].value || data[hoveredIndex].count}</div>
          <div className="text-gray-400">{data[hoveredIndex].label || data[hoveredIndex].date}</div>
        </div>
      )}

      {/* X-axis labels */}
      <div className="flex justify-between px-1 mt-2 text-xs text-gray-500">
        {data.length > 0 && (
          <>
            <span>{data[0].label || data[0].date}</span>
            {data.length > 4 && (
              <span>{data[Math.floor(data.length / 2)].label || data[Math.floor(data.length / 2)].date}</span>
            )}
            <span>{data[data.length - 1].label || data[data.length - 1].date}</span>
          </>
        )}
      </div>

      {/* Legend */}
      {comparison && (
        <div className="flex items-center justify-center gap-6 mt-3 text-xs">
          <div className="flex items-center gap-1">
            <span className="w-3 h-0.5 rounded" style={{ backgroundColor: color }}></span>
            <span className="text-gray-600">Current</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-0.5 rounded bg-gray-400" style={{ borderStyle: 'dashed' }}></span>
            <span className="text-gray-600">Previous</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrendChart;
