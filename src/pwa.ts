/**
 * Registers the offline service worker. It is skipped in development, in the Claude-hosted page (which does not allow
 * service workers), and in browsers without support, so a failure here never affects the app.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (import.meta.env.VITE_MODEL_AS_JSON === '1') return;
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    try {
      navigator.serviceWorker.register(new URL('sw.js', document.baseURI).href).catch(() => undefined);
    } catch {
      /* not allowed in this context */
    }
  });
}
