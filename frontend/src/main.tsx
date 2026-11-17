import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Self-hosted variable fonts (Fontsource). Each file is split by unicode-range,
// so browsers only download the subsets a page actually uses.
import '@fontsource-variable/fraunces/full.css'; // opsz + SOFT + WONK axes for display type
import '@fontsource-variable/fraunces/full-italic.css';
import '@fontsource-variable/instrument-sans/wdth.css'; // wght + wdth
import '@fontsource-variable/jetbrains-mono';

import { App } from '@/app/app';
import './styles/index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
