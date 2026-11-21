import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import './ui/styles.css';
import { App } from './ui/App';
import { startUiLoop } from './store/app';

startUiLoop();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
