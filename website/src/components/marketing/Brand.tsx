export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center rounded-xl"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-brand-400 via-brand-500 to-azure-500" />
      <svg
        viewBox="0 0 24 24"
        width={size * 0.62}
        height={size * 0.62}
        className="relative"
        fill="none"
      >
        <path
          d="M6 20V4.6c0-.33.27-.6.6-.6h6.1a4.4 4.4 0 1 1 0 8.8H9.1"
          stroke="#04060c"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function Wordmark({ size = 34 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="text-[1.075rem] leading-none font-semibold tracking-tight text-mist-50">
        Park<span className="text-brand-400">Peer</span>
      </span>
    </span>
  );
}
