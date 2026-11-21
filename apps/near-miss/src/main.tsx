import type { ReactNode } from 'react';
import { ChartNoAxesColumn, Info, ListChecks, Map, MapPin, Presentation } from 'lucide-react';

import { mountApp } from '@x10/shared/runtime';

import { App } from './App';
import { config } from './app.config';
import './index.css';

const ICONS: Record<string, ReactNode> = {
  '/': <Map />,
  '/report': <MapPin />,
  '/fixes': <ListChecks />,
  '/indicators': <ChartNoAxesColumn />,
  '/toolbox': <Presentation />,
  '/about': <Info />,
};

mountApp({ ...config, nav: config.nav.map((n) => ({ ...n, icon: ICONS[n.to] })) }, <App />);
