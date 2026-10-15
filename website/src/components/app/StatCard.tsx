import Icon, { type IconName } from "@/components/marketing/Icon";

export default function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "brand",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: IconName;
  tone?: "brand" | "azure" | "flare" | "muted";
}) {
  const tones = {
    brand: "bg-brand-500/12 text-brand-300",
    azure: "bg-azure-500/12 text-azure-300",
    flare: "bg-flare-500/12 text-flare-300",
    muted: "bg-ink-700 text-mist-300",
  } as const;

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.72rem] tracking-[0.14em] text-mist-400 uppercase">{label}</p>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon name={icon} size={17} />
        </span>
      </div>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-mist-50">{value}</p>
      {hint ? <p className="mt-1.5 text-[0.78rem] text-mist-400">{hint}</p> : null}
    </div>
  );
}
