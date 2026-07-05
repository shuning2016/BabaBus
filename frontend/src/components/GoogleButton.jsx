import { useEffect, useRef } from 'react';

// Web OAuth client id, injected at build time from Vercel's VITE_GOOGLE_CLIENT_ID.
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

let gisPromise = null;
function loadGis() {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return gisPromise;
}

// Renders Google's official "Sign in with Google" button and hands the returned
// ID token to onCredential. Renders a hint if the client id isn't configured.
export default function GoogleButton({ onCredential }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!CLIENT_ID) return undefined;
    let cancelled = false;
    loadGis()
      .then(() => {
        if (cancelled || !ref.current) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (resp) => resp?.credential && onCredential(resp.credential),
        });
        window.google.accounts.id.renderButton(ref.current, {
          theme: 'outline', size: 'large', width: 222, shape: 'pill',
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [onCredential]);

  if (!CLIENT_ID) return <div className="muted small">Google sign-in not configured yet.</div>;
  return <div className="gbtn" ref={ref} />;
}
