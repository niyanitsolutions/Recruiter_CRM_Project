/**
 * Line Chart Component - Phase 5
 * Reusable line chart for trends
 */
import React from 'react';

export const LineChart = ({ data = [], height = 200, color = '#3B82F6', showArea = true }) => {
  if (!data.length) return <div className="flex items-center justify-center h-48 text-gray-400">No data</div>;

  const values = data.map(d => d.value || d.count || 0);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  const points = data.map((d, i) => {
    const x = 5 + (i / (data.length - 1)) * 90;
    const y = 95 - ((values[i] - min) / range) * 90;
    return { x, y };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L 95 95 L 5 95 Z`;

  return (
    <div style={{ height }}>
      <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
        {showArea && <path d={areaD} fill={color} fillOpacity="0.1" />}
        <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
        {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="1.5" fill={color} />)}
      </svg>
    </div>
  );
};

/**
 * Bar Chart Component
 */
export const BarChart = ({ data = [], height = 200, color = '#3B82F6', horizontal = false }) => {
  if (!data.length) return <div className="flex items-center justify-center h-48 text-gray-400">No data</div>;

  const max = Math.max(...data.map(d => d.value || d.count || 0));
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

  if (horizontal) {
    return (
      <div style={{ height }} className="space-y-2">
        {data.slice(0, 6).map((item, i) => {
          const value = item.value || item.count || 0;
          const pct = max ? (value / max * 100) : 0;
          return (
            <div key={i} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 truncate">{item.label || item.name}</span>
                <span className="font-medium">{value}</span>
              </div>
              <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: colors[i % colors.length] }} />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ height }} className="flex items-end justify-around gap-2">
      {data.slice(0, 8).map((item, i) => {
        const value = item.value || item.count || 0;
        const pct = max ? (value / max * 100) : 0;
        return (
          <div key={i} className="flex flex-col items-center flex-1">
            <span className="text-xs mb-1">{value}</span>
            <div className="w-full bg-gray-100 rounded-t" style={{ height: height - 40 }}>
              <div className="w-full rounded-t" style={{ height: `${pct}%`, marginTop: `${100-pct}%`, backgroundColor: colors[i % colors.length] }} />
            </div>
            <span className="text-xs text-gray-500 truncate w-full text-center mt-1">{(item.label || item.name || '').slice(0, 6)}</span>
          </div>
        );
      })}
    </div>
  );
};

/**
 * Pie Chart Component
 */
export const PieChart = ({ data = [], size = 150, donut = false }) => {
  if (!data.length) return <div className="flex items-center justify-center h-48 text-gray-400">No data</div>;

  const total = data.reduce((s, d) => s + (d.value || d.count || 0), 0);
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
  const r = 40, c = 50, ir = donut ? 25 : 0;
  let angle = 0;

  const polar = (a) => ({ x: c + r * Math.cos((a - 90) * Math.PI / 180), y: c + r * Math.sin((a - 90) * Math.PI / 180) });
  const polarIn = (a) => ({ x: c + ir * Math.cos((a - 90) * Math.PI / 180), y: c + ir * Math.sin((a - 90) * Math.PI / 180) });

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" style={{ width: size, height: size }}>
        {data.map((item, i) => {
          const val = item.value || item.count || 0;
          const sweep = (val / total) * 360;
          const start = polar(angle);
          const end = polar(angle + sweep);
          const startIn = polarIn(angle);
          const endIn = polarIn(angle + sweep);
          const large = sweep > 180 ? 1 : 0;
          const path = donut
            ? `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y} L ${endIn.x} ${endIn.y} A ${ir} ${ir} 0 ${large} 0 ${startIn.x} ${startIn.y} Z`
            : `M ${c} ${c} L ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y} Z`;
          angle += sweep;
          return <path key={i} d={path} fill={colors[i % colors.length]} stroke="white" strokeWidth="1" />;
        })}
      </svg>
      <div className="space-y-1">
        {data.slice(0, 5).map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[i % colors.length] }} />
            <span className="text-gray-600">{item.label || item.name}</span>
            <span className="font-medium">{item.value || item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Funnel Chart Component
 */
export const FunnelChart = ({ data = [], height = 200 }) => {
  if (!data.length) return <div className="flex items-center justify-center h-48 text-gray-400">No data</div>;

  const max = Math.max(...data.map(d => d.value || d.count || 0));
  const colors = ['#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF'];

  return (
    <div style={{ height }} className="space-y-2">
      {data.map((item, i) => {
        const val = item.value || item.count || 0;
        const pct = max ? (val / max * 100) : 0;
        const prev = i > 0 ? (data[i-1].value || data[i-1].count) : null;
        const conv = prev ? ((val / prev) * 100).toFixed(0) : null;
        
        return (
          <div key={i} className="flex items-center gap-3">
            <span className="w-20 text-sm text-right text-gray-600">{item.label || item.stage}</span>
            <div className="flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden">
              <div className="h-full rounded-lg flex items-center px-2" style={{ width: `${Math.max(pct, 5)}%`, backgroundColor: colors[i % colors.length] }}>
                <span className="text-xs text-white font-medium">{val}</span>
              </div>
            </div>
            <span className="w-12 text-xs text-gray-500">{conv ? `${conv}%` : ''}</span>
          </div>
        );
      })}
    </div>
  );
};

/**
 * Gauge Chart Component
 */
export const GaugeChart = ({ value = 0, max = 100, size = 120, label = '' }) => {
  const pct = Math.min((value / max) * 100, 100);
  const angle = (pct / 100) * 180;
  const color = pct >= 75 ? '#10B981' : pct >= 50 ? '#3B82F6' : pct >= 25 ? '#F59E0B' : '#EF4444';

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 100 60" style={{ width: size, height: size * 0.6 }}>
        <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#E5E7EB" strokeWidth="8" strokeLinecap="round" />
        <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${(angle / 180) * 126} 126`} />
      </svg>
      <div className="text-center -mt-4">
        <span className="text-2xl font-bold" style={{ color }}>{value}</span>
        {label && <p className="text-xs text-gray-500">{label}</p>}
      </div>
    </div>
  );
};

export default { LineChart, BarChart, PieChart, FunnelChart, GaugeChart };
