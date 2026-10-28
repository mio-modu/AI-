"use client";

type Option = { id: string; label: string; hint?: string };

export default function OptionGrid({
  title,
  description,
  options,
  value,
  onChange,
  columns = 3,
}: {
  title: string;
  description?: string;
  options: readonly Option[];
  value: string;
  onChange: (id: string) => void;
  columns?: number;
}) {
  return (
    <section>
      <div className="field-title">{title}</div>
      {description ? <div className="field-desc">{description}</div> : null}
      <div
        className="mt-2.5 grid gap-2"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className="opt"
            data-active={value === opt.id}
            aria-pressed={value === opt.id}
            onClick={() => onChange(opt.id)}
          >
            <div className="opt-label">{opt.label}</div>
            {opt.hint ? <div className="opt-hint">{opt.hint}</div> : null}
          </button>
        ))}
      </div>
    </section>
  );
}
