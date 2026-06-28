import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './global.css';
import { HomeApp } from './HomeApp.js';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

createRoot(rootEl).render(
  <StrictMode>
    <HomeApp />
  </StrictMode>,
);
