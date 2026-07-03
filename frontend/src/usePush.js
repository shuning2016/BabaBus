import { useEffect, useState } from 'react';
import { getVapidKey, subscribePush, unsubscribePush } from './api';

const urlB64ToUint8Array = (base64) => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

/**
 * Manage this device's Web Push subscription for bus alarms.
 * status: 'unsupported' | 'needs-install' | 'off' | 'on' | 'denied'
 */
export default function usePush() {
  const [status, setStatus] = useState('off');
  const [busy, setBusy] = useState(false);

  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  useEffect(() => {
    if (!supported) { setStatus(isIOS() && !isStandalone() ? 'needs-install' : 'unsupported'); return; }
    if (isIOS() && !isStandalone()) { setStatus('needs-install'); return; }
    if (Notification.permission === 'denied') { setStatus('denied'); return; }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setStatus(sub ? 'on' : 'off'))
      .catch(() => setStatus('off'));
  }, [supported]);

  const enable = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setStatus('denied'); return; }
      const reg = await navigator.serviceWorker.ready;
      const { public_key } = await getVapidKey();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(public_key),
      });
      const j = sub.toJSON();
      await subscribePush({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
      setStatus('on');
    } catch {
      setStatus('off');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await unsubscribePush({ endpoint: sub.endpoint }); await sub.unsubscribe(); }
      setStatus('off');
    } catch { /* leave as-is */ } finally { setBusy(false); }
  };

  return { status, busy, enable, disable };
}
