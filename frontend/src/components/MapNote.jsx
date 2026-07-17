import { useState } from 'react';

/**
 * 免责声明 for live bus motion. Shown expanded once (first map visit), then
 * collapses to a small ⓘ chip in the corner — tap to re-read anytime.
 */
export default function MapNote() {
  const [open, setOpen] = useState(() => !localStorage.getItem('bababus-map-note-seen'));

  const dismiss = () => {
    try { localStorage.setItem('bababus-map-note-seen', '1'); } catch { /* ignore */ }
    setOpen(false);
  };

  if (!open) {
    return (
      <button className="mapnote-chip" onClick={() => setOpen(true)} title="About bus positions · 关于巴士位置">
        ⓘ 估算位置 · est. positions
      </button>
    );
  }
  return (
    <div className="mapnote-card">
      <h4>ⓘ 巴士位置为估算 · Bus positions are estimates</h4>
      <ul>
        <li>官方 GPS 定位本身存在误差，巴士位置可能与实际略有偏差。<br />
          <span className="en">The official GPS data itself isn't fully accurate — a bus may be slightly off its true position.</span></li>
        <li>官方数据每 15–60 秒更新一次，其间的移动为平滑模拟。<br />
          <span className="en">Official data updates every 15–60 s; movement in between is simulated smoothly.</span></li>
        <li>巴士临近车站（前 3 班）才会出现，因此会淡入淡出。<br />
          <span className="en">A bus appears only when it's among the next 3 arrivals nearby — so buses fade in and out.</span></li>
        <li>到站时间请以列表中的数字为准。<br />
          <span className="en">For exact timings, trust the minutes shown in the stop lists.</span></li>
      </ul>
      <button className="pill mapnote-ok" onClick={dismiss}>知道了 · Got it</button>
    </div>
  );
}
