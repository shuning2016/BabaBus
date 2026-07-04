import { useState } from 'react';
import GoogleButton from './GoogleButton';
import { googleSignIn } from '../api';

// Deterministic tint from the device id so each anonymous "account" gets a
// stable default avatar. Signed-in users show their real photo + name.
function colorFromId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h}deg 58% 45%)`;
}

export default function AccountButton({ deviceId = '', mode = '', account = null, onSignedIn, onSignedOut }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const anon = !account;
  const shortId = deviceId.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase() || '------';
  const name = anon ? `Guest ${shortId}` : account.name;
  const tint = colorFromId(deviceId || 'x');

  const avatar = (big) =>
    !anon && account.image ? (
      <img className={`avatar${big ? ' lg' : ''}`} src={account.image} alt="" referrerPolicy="no-referrer" />
    ) : (
      <span className={`avatar${big ? ' lg' : ''}`} style={{ background: tint }}>👤</span>
    );

  const handleCredential = async (credential) => {
    setBusy(true);
    try {
      const r = await googleSignIn(credential);
      onSignedIn?.(r.token, r.account);
      setOpen(false);
    } catch {
      /* sign-in failed — leave the menu open */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="account">
      <button className="accountbtn" onClick={() => setOpen((o) => !o)} title="Account" aria-label="Account">
        {avatar(false)}
      </button>
      {open && (
        <>
          <div className="account-backdrop" onClick={() => setOpen(false)} />
          <div className="account-menu">
            <div className="account-head">
              {avatar(true)}
              <div className="account-id">
                <div className="account-name">{name}</div>
                <div className="account-sub">{anon ? 'Anonymous · this device' : account.email || ''}</div>
              </div>
            </div>

            {anon ? (
              <>
                <div className="account-row"><span>User ID</span><code>{shortId}</code></div>
                <div className="account-signin-wrap">
                  {busy ? <div className="muted small">Signing in…</div> : <GoogleButton onCredential={handleCredential} />}
                </div>
                <div className="muted small account-note">
                  Sign in to sync your favourites &amp; alarms across devices. Apple &amp; email coming soon.
                </div>
              </>
            ) : (
              <>
                <div className="account-row"><span>Signed in with</span><span>Google</span></div>
                <div className="account-row"><span>Live data</span><span>{(mode || '').toUpperCase()}</span></div>
                <button className="pill ghost account-signin" onClick={() => { onSignedOut?.(); setOpen(false); }}>
                  Sign out
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
