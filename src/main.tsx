import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/fonts.css';
import './ui/styles.css';
import { App } from './ui/App';
import { ErrorBoundary } from './ui/components/ErrorBoundary';
import { startUiLoop } from './store/app';

startUiLoop();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary where="aplikacji">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
