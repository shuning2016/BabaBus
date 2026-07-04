import React from 'react';
import ReactDOM from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './theme.css';
import App from './App.jsx';
import { requestPersistentStorage } from './device';

requestPersistentStorage(); // keep this device's favourites/alarms from being evicted

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Installable PWA (Android "Add to Home Screen"); dev stays SW-free.
if (!import.meta.env.DEV && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}
