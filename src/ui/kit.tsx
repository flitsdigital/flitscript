import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "brand" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-neutral-700",
  brand: "bg-flits text-ink hover:bg-flits-deep",
  secondary: "bg-white text-ink ring-1 ring-neutral-200 hover:bg-neutral-50",
  ghost: "text-neutral-600 hover:bg-neutral-100 hover:text-ink",
};

export function Button({
  variant = "secondary",
  icon,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: ReactNode }) {
  return (
    <button
      type="button"
      className={`press inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 font-medium whitespace-nowrap disabled:pointer-events-none disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

export function IconButton({ label, className = "", children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`press inline-flex size-8 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-ink disabled:pointer-events-none disabled:opacity-35 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? "bg-ink" : "bg-neutral-300"}`}
    >
      <span className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : ""}`} />
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div className="flex rounded-lg bg-neutral-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`h-7 flex-1 rounded-md px-2 font-medium transition-colors ${o.value === value ? "bg-white text-ink shadow-sm" : "text-neutral-500 hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`space-y-3 rounded-xl border border-neutral-200 bg-white p-3 ${className}`}>{children}</div>;
}

export const fieldClass =
  "h-8 w-full rounded-lg bg-white px-2.5 ring-1 ring-neutral-200 outline-none transition-shadow focus:ring-2 focus:ring-flits disabled:opacity-50";

export function Slider(props: { label: string; min: number; max: number; step: number; value: number; format: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="block space-y-1.5">
      <span className="flex justify-between text-neutral-500">
        {props.label}
        <span className="font-medium tabular-nums text-ink">{props.format(props.value)}</span>
      </span>
      <input
        type="range"
        className="slider"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  );
}
