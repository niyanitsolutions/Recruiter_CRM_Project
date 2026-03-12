/**
 * Report Chart Component - Phase 5
 * Displays report data as various chart types
 */
import React, { useState } from 'react';
import { BarChart2, PieChart, TrendingUp, Table } from 'lucide-react';

const ReportChart = ({ data = [], chartType = 'bar', title, height = 300 }) => {
  const [activeType, setActiveType] = useState(chartType);

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg text-gray-400">
        No chart data available
      </div>
    );
  }

  const chartTypes = [
    { type: 'bar', icon: BarChart2, label: 'Bar' },
    { type: 'pie', icon: PieChart, label: 'Pie' },
    { type: 'line', icon: TrendingUp, label: 'Line' }
  ];

  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
  const maxValue = Math.max(...data.map(d => d.value || d.count || 0));

  const renderBarChart = () => (
    <div className="space-y-3" style={{ height }}>
      {data.slice(0, 10).map((item, index) => {
        const value = item.value || item.count || 0;
        const percentage = maxValue ? (value / maxValue * 100) : 0;
        
        return (
          <div key={index} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-700 truncate max-w-[200px]">
                {item.label || item.name || item.key}
              </span>
              <span className="font-medium text-gray-900">
                {typeof value === 'number' ? value.toLocaleString() : value}
              </span>
            </div>
            <div className="h-6 bg-gray-100 rounded-lg overflow-hidden">
              <div
                className="h-full rounded-lg transition-all duration-500 flex items-center justify-end pr-2"
                style={{
                  width: `${Math.max(percentage, 3)}%`,
                  backgroundColor: colors[index % colors.length]
                }}
              >
                {percentage > 15 && (
                  <span className="text-xs text-white font-medium">
                    {percentage.toFixed(0)}%
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderPieChart = () => {
    const total = data.reduce((sum, d) => sum + (d.value || d.count || 0), 0);
    const radius = 80;
    const center = 100;

    let currentAngle = 0;

    const polarToCartesian = (cx, cy, r, angle) => {
      const rad = (angle - 90) * Math.PI / 180;
      return {
        x: cx + r * Math.cos(rad),
        y: cy + r * Math.sin(rad)
      };
    };

    const getPath = (startAngle, endAngle) => {
      const start = polarToCartesian(center, center, radius, endAngle);
      const end = polarToCartesian(center, center, radius, startAngle);
      const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;

      return [
        'M', center, center,
        'L', start.x, start.y,
        'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y,
        'Z'
      ].join(' ');
    };

    return (
      <div className="flex items-center gap-8" style={{ height }}>
        <svg viewBox="0 0 200 200" className="w-48 h-48">
          {data.slice(0, 8).map((item, index) => {
            const value = item.value || item.count || 0;
            const angle = (value / total) * 360;
            const path = getPath(currentAngle, currentAngle + angle);
            currentAngle += angle;

            return (
              <path
                key={index}
                d={path}
                fill={colors[index % colors.length]}
                stroke="white"
                strokeWidth="2"
                className="hover:opacity-80 cursor-pointer transition-opacity"
              />
            );
          })}
        </svg>

        <div className="space-y-2 flex-1">
          {data.slice(0, 8).map((item, index) => {
            const value = item.value || item.count || 0;
            const percentage = total ? ((value / total) * 100).toFixed(1) : 0;

            return (
              <div key={index} className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: colors[index % colors.length] }}
                />
                <span className="text-sm text-gray-600 truncate flex-1">
                  {item.label || item.name || item.key}
                </span>
                <span className="text-sm font-medium text-gray-900">
                  {percentage}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderLineChart = () => {
    const chartHeight = 200;
    const chartWidth = 400;
    const padding = 40;
    const minValue = Math.min(...data.map(d => d.value || d.count || 0));
    const range = maxValue - minValue || 1;

    const points = data.map((d, i) => {
      const x = padding + (i / (data.length - 1)) * (chartWidth - 2 * padding);
      const y = chartHeight - padding - ((d.value || d.count || 0) - minValue) / range * (chartHeight - 2 * padding);
      return { x, y, value: d.value || d.count || 0, label: d.label || d.name };
    });

    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaD = `${pathD} L ${points[points.length - 1].x} ${chartHeight - padding} L ${padding} ${chartHeight - padding} Z`;

    return (
      <div style={{ height }}>
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-full">
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map(pct => {
            const y = chartHeight - padding - (pct / 100) * (chartHeight - 2 * padding);
            return (
              <g key={pct}>
                <line
                  x1={padding}
                  y1={y}
                  x2={chartWidth - padding}
                  y2={y}
                  stroke="#E5E7EB"
                  strokeWidth="1"
                />
                <text x={padding - 8} y={y + 4} textAnchor="end" className="text-xs fill-gray-400">
                  {Math.round(minValue + (pct / 100) * range)}
                </text>
              </g>
            );
          })}

          {/* Area */}
          <path d={areaD} fill="#3B82F6" fillOpacity="0.1" />

          {/* Line */}
          <path
            d={pathD}
            fill="none"
            stroke="#3B82F6"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Points */}
          {points.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="4" fill="#3B82F6" />
              <circle cx={p.x} cy={p.y} r="8" fill="#3B82F6" fillOpacity="0.2" />
            </g>
          ))}

          {/* X-axis labels */}
          {points.filter((_, i) => i % Math.ceil(points.length / 6) === 0).map((p, i) => (
            <text
              key={i}
              x={p.x}
              y={chartHeight - 10}
              textAnchor="middle"
              className="text-xs fill-gray-500"
            >
              {p.label?.substring(0, 10)}
            </text>
          ))}
        </svg>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Chart Type Selector */}
      <div className="flex items-center justify-between">
        {title && <h4 className="font-medium text-gray-900">{title}</h4>}
        
        <div className="flex bg-gray-100 rounded-lg p-1">
          {chartTypes.map(ct => {
            const Icon = ct.icon;
            return (
              <button
                key={ct.type}
                onClick={() => setActiveType(ct.type)}
                className={`p-2 rounded-md transition-colors ${
                  activeType === ct.type
                    ? 'bg-white shadow text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                title={ct.label}
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white p-4 rounded-lg">
        {activeType === 'bar' && renderBarChart()}
        {activeType === 'pie' && renderPieChart()}
        {activeType === 'line' && renderLineChart()}
      </div>
    </div>
  );
};

export default ReportChart;
