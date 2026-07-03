import { useEffect, useState } from 'react';

/** Captures Chrome's beforeinstallprompt so the app can offer its own
 *  "Install" button instead of relying on users finding the browser menu. */
export default function useInstallPrompt() {
  const [deferred, setDeferred] = useState(null);

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  return {
    canInstall: !!deferred,
    install: () => deferred?.prompt().then(() => setDeferred(null)),
  };
}
