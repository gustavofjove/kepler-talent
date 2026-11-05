/** Decorative toolbar icons: each button carries its accessible name as text. */

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export function BoldIcon() {
  return (
    <Icon>
      <path {...STROKE} d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" />
    </Icon>
  );
}

export function ItalicIcon() {
  return (
    <Icon>
      <path {...STROKE} d="M10 5h8M6 19h8M14 5l-4 14" />
    </Icon>
  );
}

export function BulletListIcon() {
  return (
    <Icon>
      <path {...STROKE} d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1.3" fill="currentColor" />
      <circle cx="4.5" cy="12" r="1.3" fill="currentColor" />
      <circle cx="4.5" cy="18" r="1.3" fill="currentColor" />
    </Icon>
  );
}

export function NumberedListIcon() {
  return (
    <Icon>
      <path {...STROKE} d="M10 6h10M10 12h10M10 18h10" />
      <path
        {...STROKE}
        strokeWidth={1.6}
        d="M4 4.5 5.5 3.5V8.5M3.5 14.5a1.5 1.5 0 1 1 2.6 1L3.5 18.5h3"
      />
    </Icon>
  );
}
