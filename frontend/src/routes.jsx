/**
 * Phase 5 Routes Configuration - Complete
 * Add these routes to your existing App.jsx or router configuration
 */

// ============== Import Phase 5 Pages ==============

// Reports
import ReportsPage from './pages/reports/ReportsPage';
import ReportGenerator from './pages/reports/ReportGenerator';
import ReportViewer from './pages/reports/ReportViewer';
import SavedReports from './pages/reports/SavedReports';

// Analytics
import AnalyticsDashboard from './pages/analytics/AnalyticsDashboard';

// Imports/Exports
import ImportsPage from './pages/imports/ImportsPage';
import ExportsPage from './pages/exports/ExportsPage';

// Targets
import TargetsPage from './pages/targets/TargetsPage';
import Leaderboard from './pages/targets/Leaderboard';

// Audit
import AuditLogsPage from './pages/audit/AuditLogsPage';

// ============== Phase 5 Routes ==============
export const phase5Routes = [
  // Reports
  { path: '/reports', element: <ReportsPage />, permission: 'reports:view' },
  { path: '/reports/generate/:reportType', element: <ReportGenerator />, permission: 'reports:view' },
  { path: '/reports/view/:reportId', element: <ReportViewer />, permission: 'reports:view' },
  { path: '/reports/saved', element: <SavedReports />, permission: 'reports:view' },
  { path: '/reports/edit/:reportId', element: <ReportGenerator />, permission: 'reports:edit' },

  // Analytics
  { path: '/analytics', element: <AnalyticsDashboard />, permission: 'analytics:view' },

  // Imports/Exports
  { path: '/imports', element: <ImportsPage />, permission: 'imports:view' },
  { path: '/exports', element: <ExportsPage />, permission: 'exports:view' },

  // Targets
  { path: '/targets', element: <TargetsPage />, permission: 'targets:view' },
  { path: '/targets/:targetId', element: <TargetsPage />, permission: 'targets:view' },
  { path: '/targets/edit/:targetId', element: <TargetsPage />, permission: 'targets:edit' },
  { path: '/leaderboard', element: <Leaderboard />, permission: 'targets:view' },

  // Audit
  { path: '/audit', element: <AuditLogsPage />, permission: 'audit:view' },
  { path: '/audit/sessions', element: <AuditLogsPage />, permission: 'audit:sessions' },
  { path: '/audit/alerts', element: <AuditLogsPage />, permission: 'audit:alerts' }
];

// ============== Navigation Menu Items ==============
export const phase5NavItems = [
  { label: 'Analytics', icon: 'BarChart2', path: '/analytics', permission: 'analytics:view' },
  { label: 'Reports', icon: 'FileText', path: '/reports', permission: 'reports:view',
    children: [
      { label: 'Generate Report', path: '/reports', permission: 'reports:view' },
      { label: 'Saved Reports', path: '/reports/saved', permission: 'reports:view' }
    ]
  },
  { label: 'Targets', icon: 'Target', path: '/targets', permission: 'targets:view',
    children: [
      { label: 'My Targets', path: '/targets', permission: 'targets:view' },
      { label: 'Leaderboard', path: '/leaderboard', permission: 'targets:view' }
    ]
  },
  { label: 'Data', icon: 'Database', permission: 'imports:view',
    children: [
      { label: 'Import Data', path: '/imports', permission: 'imports:view' },
      { label: 'Export Data', path: '/exports', permission: 'exports:view' }
    ]
  },
  { label: 'Audit & Security', icon: 'Shield', path: '/audit', permission: 'audit:view' }
];

export default { routes: phase5Routes, navItems: phase5NavItems };
