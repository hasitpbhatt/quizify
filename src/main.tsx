import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/global.css';
import '@/styles/notebook.css';
import { App } from '@/app/App';

window.addEventListener('unhandledrejection', (event) => {
  console.error('[unhandledrejection]', event.reason);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
