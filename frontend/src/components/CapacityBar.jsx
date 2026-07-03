const LEVELS = { SEA: 1, SDA: 2, LSD: 3 };
const LABELS = { SEA: 'Seats available', SDA: 'Standing', LSD: 'Crowded' };

export default function CapacityBar({ load }) {
  const level = LEVELS[load] ?? 1;
  return (
    <span className="bars" title={LABELS[load] ?? load}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={`bar ${i <= level ? 'on' : ''}`}
          style={{ height: `${6 + i * 4}px` }}
        />
      ))}
    </span>
  );
}
