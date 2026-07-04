import { useState } from 'react';

// Deterministic tint from the device id so each anonymous "account" gets a
// stable default avatar. When accounts land, pass an `account` prop
// ({ name, email, image }) and it renders that instead.
function colorFromId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h}deg 58% 45%)`;
}

export default function AccountButton({ deviceId = '', mode = '', account = null }) {
  const [open, setOpen] = useState(false);
  const anon = !account;
  const shortId = deviceId.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase() || '------';
  const name = anon ? `Guest ${shortId}` : account.name;
  const tint = colorFromId(deviceId || 'x');

  const avatar = (big) =>
    !anon && account.image ? (
      <img className={`avatar${big ? ' lg' : ''}`} src={account.image} alt="" />
    ) : (
      <span className={`avatar${big ? ' lg' : ''}`} style={{ background: tint }}>👤</span>
    );

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
            <div className="account-row"><span>User ID</span><code>{shortId}</code></div>
            <div className="account-row"><span>Live data</span><span>{(mode || '').toUpperCase()}</span></div>
            {anon && (
              <button className="pill ghost account-signin" disabled title="Coming soon">
                Sign in to sync (coming soon)
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
