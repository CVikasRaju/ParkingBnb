export default function FormField({
  label,
  name,
  type = "text",
  placeholder,
  autoComplete,
  required = true,
  minLength,
  defaultValue,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  defaultValue?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[0.78rem] font-medium tracking-wide text-mist-300">
        {label}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        className="w-full rounded-xl border border-ink-600/80 bg-ink-900/70 px-4 py-3 text-sm text-mist-50 transition-colors outline-none placeholder:text-mist-500 focus:border-brand-400/70 focus:bg-ink-900 focus:ring-2 focus:ring-brand-500/20"
      />
      {hint ? <span className="mt-1.5 block text-[0.72rem] text-mist-500">{hint}</span> : null}
    </label>
  );
}
