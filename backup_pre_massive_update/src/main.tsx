import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Intercept all fetch requests to automatically attach saved Discord sessions from localStorage
const originalFetch = window.fetch;
const customFetch = function (this: any, input: RequestInfo | URL, init?: RequestInit) {
  const session = localStorage.getItem("discord_session");
  if (session) {
    const customInit = (init || {}) as any;
    customInit.headers = customInit.headers || {};
    if (customInit.headers instanceof Headers) {
      customInit.headers.set("x-user-session", session);
    } else if (Array.isArray(customInit.headers)) {
      customInit.headers.push(["x-user-session", session]);
    } else {
      customInit.headers["x-user-session"] = session;
    }
    return originalFetch.call(this, input, customInit);
  }
  return originalFetch.call(this, input, init);
};

try {
  Object.defineProperty(window, 'fetch', {
    value: customFetch,
    writable: true,
    configurable: true
  });
} catch (e) {
  console.warn("Could not redefine window.fetch directly, using custom property define fallback.", e);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

