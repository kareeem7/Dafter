import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

// Surface any uncaught runtime error on the page instead of leaving a
// blank white screen — an invisible crash is the worst failure mode.
window.addEventListener('error', (event) => {
  if (event.error) {
    console.error('Uncaught error:', event.error);
  }
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled rejection:', event.reason);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
