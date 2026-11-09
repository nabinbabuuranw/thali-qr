// The Ticket Rail mark: a brass rail with one paper order ticket hanging from it, its perforation and a 3x3 module grid for the QR.
export function ThaliMark({ size = 32, label }: { size?: number; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false">
      <line x1="2" y1="7" x2="38" y2="7" stroke="var(--brass, #B7862A)" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M11 9.5 V13 M29 9.5 V13" stroke="var(--brass, #B7862A)" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 14 H31 V35 L28 33 L25 35 L22 33 L19 35 L16 33 L13 35 L9 33 Z" fill="currentColor" />
      <line x1="9" y1="20" x2="31" y2="20" stroke="var(--paper, #F9F3EF)" strokeWidth="1.4" strokeDasharray="2 2" />
      {[0, 1, 2].map((r) => [0, 1, 2].map((c) => (
        <rect key={`${r}${c}`} x={14 + c * 4.2} y={23 + r * 3.2} width="2.6" height="2.2" fill="var(--paper, #F9F3EF)" />
      )))}
    </svg>
  );
}

/** Veg and non-veg marks, the way menus in Nepal print them: a square outline with a dot. */
export function DietMark({ diet }: { diet: 'veg' | 'nonveg' }) {
  const c = diet === 'veg' ? 'var(--ok)' : 'var(--rose)';
  return (
    <span className="diet" style={{ borderColor: c }} title={diet === 'veg' ? 'Vegetarian' : 'Contains meat or egg'} role="img" aria-label={diet === 'veg' ? 'Vegetarian' : 'Non-vegetarian'}>
      <span style={{ background: c }} />
    </span>
  );
}

export function SpiceDots({ level }: { level: number }) {
  return (
    <span className="spice" role="img" aria-label={`Spice level ${level} of 3`} title={`Spice ${level} of 3`}>
      {[0, 1, 2].map((i) => (
        <i key={i} className={i < level ? 'on' : ''} />
      ))}
    </span>
  );
}
