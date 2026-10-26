import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { registerServiceWorker } from './pwa';
import './styles.css';

// The Claude-hosted copy of the page is already padded by the phone's safe-area insets.
if (import.meta.env.VITE_MODEL_AS_JSON === '1') document.documentElement.classList.add('in-artifact');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
