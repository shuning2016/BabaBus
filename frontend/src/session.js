// Opaque session token for a signed-in account (kept in localStorage). When
// present it's sent as a Bearer token so the backend scopes data by account
// instead of by anonymous device id.
const KEY = 'bababus-session';

export function sessionToken() {
  try {
    return localStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
}

export function setSessionToken(token) {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked — stay signed out */
  }
}
