import type { ReactNode } from "react";

export type IconName =
  | "pin"
  | "locate"
  | "lock"
  | "bell"
  | "qr"
  | "shield"
  | "wallet"
  | "car"
  | "home"
  | "sparkles"
  | "clock"
  | "camera"
  | "plug"
  | "chart"
  | "check"
  | "arrow"
  | "users"
  | "bolt"
  | "globe"
  | "gavel"
  | "sensor"
  | "route"
  | "scan"
  | "key";

const ICONS: Record<IconName, ReactNode> = {
  pin: (
    <>
      <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.6" />
    </>
  ),
  locate: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10" width="15" height="10.5" rx="2.6" />
      <path d="M8.2 10V7.6a3.8 3.8 0 0 1 7.6 0V10" />
    </>
  ),
  bell: (
    <>
      <path d="M6.5 10.5a5.5 5.5 0 0 1 11 0c0 3.2 1.5 4.5 1.5 4.5H5s1.5-1.3 1.5-4.5Z" />
      <path d="M10 18.5a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  qr: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.4" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.4" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.4" />
      <path d="M13.5 13.5h3v3h-3zM20 13.5v6.5h-3.5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.2 5 6v6c0 4.3 3 7.6 7 8.9 4-1.3 7-4.6 7-8.9V6l-7-2.8Z" />
      <path d="M9.3 12.2l1.9 1.9 3.6-3.6" />
    </>
  ),
  wallet: (
    <>
      <rect x="3.5" y="6.5" width="17" height="12.5" rx="2.8" />
      <path d="M3.5 10.5h17" />
      <circle cx="16.6" cy="15" r="1.1" />
    </>
  ),
  car: (
    <>
      <path d="M4 15.5 5.4 10c.3-1 .8-1.6 1.9-1.6h9.4c1.1 0 1.6.6 1.9 1.6l1.4 5.5" />
      <path d="M3.6 15.5h16.8v3.1h-2.6M3.6 18.6h2.8" />
      <circle cx="7.4" cy="18.6" r="1.5" />
      <circle cx="16.6" cy="18.6" r="1.5" />
    </>
  ),
  home: (
    <>
      <path d="M4.5 10.6 12 4.4l7.5 6.2V19a1.4 1.4 0 0 1-1.4 1.4H5.9A1.4 1.4 0 0 1 4.5 19Z" />
      <path d="M9.6 20.4v-5.6h4.8v5.6" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3.5l1.7 4.4L18 9.6l-4.3 1.7L12 15.7l-1.7-4.4L6 9.6l4.3-1.7Z" />
      <path d="M18.4 15.4l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.6V12l3.2 2" />
    </>
  ),
  camera: (
    <>
      <path d="M3.8 8.6A1.8 1.8 0 0 1 5.6 6.8h2.3l1.3-2h5.6l1.3 2h2.3a1.8 1.8 0 0 1 1.8 1.8v8.4a1.8 1.8 0 0 1-1.8 1.8H5.6a1.8 1.8 0 0 1-1.8-1.8Z" />
      <circle cx="12" cy="12.6" r="3.2" />
    </>
  ),
  plug: (
    <>
      <path d="M9 3.6v5.2M15 3.6v5.2" />
      <path d="M6.6 8.8h10.8v2.3a5.4 5.4 0 0 1-5.4 5.4 5.4 5.4 0 0 1-5.4-5.4Z" />
      <path d="M12 16.5v3.9" />
    </>
  ),
  chart: (
    <>
      <path d="M4.5 19.5V4.5" />
      <path d="M4.5 19.5h15" />
      <path d="M8.4 16V11M12.6 16V7.6M16.8 16v-3.2" />
    </>
  ),
  check: <path d="M5 12.8l4.4 4.4L19 7.6" />,
  arrow: (
    <>
      <path d="M5 12h13.5" />
      <path d="M13.4 6.8l5.1 5.2-5.1 5.2" />
    </>
  ),
  users: (
    <>
      <circle cx="9.2" cy="8.6" r="3.4" />
      <path d="M3.6 19.2a5.6 5.6 0 0 1 11.2 0" />
      <path d="M16.2 6.2a3 3 0 0 1 0 5.6M17.4 14.4a5.4 5.4 0 0 1 3 4.8" />
    </>
  ),
  bolt: <path d="M13.6 2.8 5.4 13.6h5.2l-.9 7.6 8.2-10.8h-5.2Z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M3.6 12h16.8" />
      <path d="M12 3.6c2.4 2.4 3.6 5.3 3.6 8.4S14.4 18 12 20.4C9.6 18 8.4 15.1 8.4 12S9.6 6 12 3.6Z" />
    </>
  ),
  gavel: (
    <>
      <path d="M13.8 3.9l6.3 6.3-2.4 2.4-6.3-6.3Z" />
      <path d="M10.4 7.3l5.3 5.3" />
      <path d="M3.6 20.4h9.6" />
      <path d="M9.4 11.6 4.6 16.4l2.4 2.4 4.8-4.8" />
    </>
  ),
  sensor: (
    <>
      <path d="M12 13.4v6.2" />
      <circle cx="12" cy="10.6" r="2.8" />
      <path d="M6.8 5.2a9 9 0 0 0 0 10.8M17.2 5.2a9 9 0 0 1 0 10.8" />
    </>
  ),
  route: (
    <>
      <circle cx="5.6" cy="18.4" r="2.4" />
      <circle cx="18.4" cy="5.6" r="2.4" />
      <path d="M7.8 18.4h5.4a3.4 3.4 0 0 0 0-6.8H9.6a3.4 3.4 0 0 1 0-6.8h6.4" />
    </>
  ),
  scan: (
    <>
      <path d="M4 8.4V5.8A1.8 1.8 0 0 1 5.8 4h2.6M15.6 4h2.6A1.8 1.8 0 0 1 20 5.8v2.6M20 15.6v2.6a1.8 1.8 0 0 1-1.8 1.8h-2.6M8.4 20H5.8A1.8 1.8 0 0 1 4 18.2v-2.6" />
      <path d="M4 12h16" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="8" r="3.6" />
      <path d="M10.6 10.6 20 20" />
      <path d="M16.2 16.2l-2 2M18.6 18.6l-2 2" />
    </>
  ),
};

export default function Icon({
  name,
  size = 20,
  className = "",
  strokeWidth = 1.7,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}
