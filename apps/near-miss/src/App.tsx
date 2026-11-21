import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from '@x10/shared/runtime';
import { LoadingBlock } from '@x10/shared/ui';

import { AboutPage } from './pages/AboutPage';
import { FixListPage } from './pages/FixListPage';
import { PlanPage } from './pages/PlanPage';
import { ReportDetailPage } from './pages/ReportDetailPage';
import { ReportPage } from './pages/ReportPage';
import { ToolboxPage } from './pages/ToolboxPage';

// Charts (Recharts) load only when someone opens Lead indicators.
const IndicatorsPage = lazy(() => import('./pages/IndicatorsPage'));

export function App() {
  return (
    <Routes>
      <Route path="/" element={<AppShell immersive><PlanPage /></AppShell>} />
      <Route path="/report" element={<AppShell><ReportPage /></AppShell>} />
      <Route path="/reports/:id" element={<AppShell><ReportDetailPage /></AppShell>} />
      <Route path="/fixes" element={<AppShell><FixListPage /></AppShell>} />
      <Route
        path="/indicators"
        element={
          <AppShell wide>
            <Suspense fallback={<LoadingBlock rows={6} />}>
              <IndicatorsPage />
            </Suspense>
          </AppShell>
        }
      />
      <Route path="/toolbox" element={<AppShell><ToolboxPage /></AppShell>} />
      <Route path="/about" element={<AppShell><AboutPage /></AppShell>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
