import { useState } from 'react';

// Which app actually owns the push subscription: the browser (PWA lives inside
// Chrome) or an installed standalone BabaBus. We can't open OS settings from the
// web, so this sheet walks the user there — brand by brand, since Chinese Android
// skins bury the two settings that matter (floating banner + battery) in
// different places and are the usual reason alarms land silently or not at all.

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

const ANDROID_BRANDS = [
  {
    id: 'xiaomi',
    name: 'Xiaomi / Redmi / POCO',
    banner: '设置 → 应用设置 → 应用管理 → 找到该 App → 通知管理 → 点开提醒类别 → 打开「悬浮通知」和「允许通知」，重要性设为「高」',
    battery: '设置 → 应用设置 → 应用管理 → 该 App → 省电策略 → 选「无限制」；再开「自启动」',
  },
  {
    id: 'huawei',
    name: 'Huawei / Honor',
    banner: '设置 → 通知 → 该 App → 允许通知 → 打开「横幅」通知',
    battery: '设置 → 电池 → 应用启动管理 → 该 App → 关闭「自动管理」→ 手动开启「允许自启动 / 关联启动 / 后台活动」',
  },
  {
    id: 'oppo',
    name: 'OPPO / OnePlus / realme',
    banner: '设置 → 通知与状态栏 → 该 App → 打开「横幅通知」和「锁屏通知」',
    battery: '设置 → 电池 → 耗电保护/应用耗电管理 → 该 App → 允许「后台运行」和「自启动」',
  },
  {
    id: 'vivo',
    name: 'vivo / iQOO',
    banner: '设置 → 通知与状态栏 → 该 App → 打开「横幅」通知',
    battery: '设置 → 电池 → 后台耗电管理 → 该 App → 允许后台高耗电；i管家 → 应用管理 → 自启动 → 打开',
  },
  {
    id: 'samsung',
    name: 'Samsung',
    banner: 'Settings → Notifications → the app → its category → set to Alert / turn on Pop-up',
    battery: 'Settings → Apps → the app → Battery → Unrestricted. Also Settings → Battery → Background usage limits → add to "Never sleeping apps"',
  },
  {
    id: 'other',
    name: 'Other / 其他',
    banner: 'Settings → Apps → the app → Notifications → the category → Importance High / "Pop on screen" (弹窗/横幅)',
    battery: 'Settings → Apps → the app → Battery → Unrestricted / 无限制 (turn off battery optimization)',
  },
];

export default function NotificationHelp({ target = 'Chrome', onClose }) {
  const [brand, setBrand] = useState(ANDROID_BRANDS[0]);

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>🔔 Make bus alarms pop up</h3>
          <button className="sheet-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <p className="sheet-note">
          The alarm already reaches your phone (it shows in <strong>通知中心</strong>), but Android
          needs two settings to make it slide down as a banner <em>and</em> keep working when BabaBus
          is closed. Your phone won't let an app flip these for you — here's exactly where they are.
        </p>
        <p className="sheet-note muted">
          Pick the app you enabled alarms in — usually <strong>{target}</strong> (or the installed
          <strong> BabaBus</strong> if you added it to your home screen). 选择你开启闹钟的那个 App。
        </p>

        {isIOS ? (
          <div className="stepblock">
            <h4>iPhone</h4>
            <ol>
              <li>Settings → Notifications → <strong>BabaBus</strong> → <strong>Allow Notifications</strong> on.</li>
              <li>Set <strong>Banner Style → Persistent</strong>, and turn on <strong>Lock Screen</strong>, <strong>Banners</strong> and <strong>Sounds</strong>.</li>
              <li>iOS only delivers web push to an <strong>installed</strong> PWA (Safari → Share → Add to Home Screen, iOS 16.4+). There's no battery setting to change.</li>
            </ol>
          </div>
        ) : (
          <>
            <div className="brandrow">
              {ANDROID_BRANDS.map((b) => (
                <button
                  key={b.id}
                  className={`brandbtn ${brand.id === b.id ? 'on' : ''}`}
                  onClick={() => setBrand(b)}
                >
                  {b.name}
                </button>
              ))}
            </div>

            <div className="stepblock">
              <h4>1 · Show as a floating banner 横幅</h4>
              <p>{brand.banner}</p>
            </div>
            <div className="stepblock">
              <h4>2 · Keep alarms alive when closed 后台/电池</h4>
              <p>{brand.battery}</p>
              <p className="muted small">
                Also open Recent apps and 🔒 lock BabaBus so the system won't kill it.
              </p>
            </div>
          </>
        )}

        <button className="pill sheet-done" onClick={onClose}>Got it 知道了</button>
      </div>
    </div>
  );
}
