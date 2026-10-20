import { Pipette } from "lucide-react";
import { HexAlphaColorPicker, HexColorInput, HexColorPicker } from "react-colorful";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Flits colours first, then the accents used by the presets. */
const SWATCHES = ["#FFFFFF", "#16161A", "#FFD400", "#2EE66B", "#FF2D95", "#00D1FF", "#7C3AED", "#FF3B30", "#C6FF00", "#FF8A00"];

type Props = {
  label: string;
  /** #RRGGBB, or #RRGGBBAA when `alpha` is set. */
  value: string;
  onChange: (hex: string) => void;
  alpha?: boolean;
  /** "field" shows label and hex in a panel row; "swatch" is a compact round button for toolbars. */
  variant?: "field" | "swatch";
};

export function ColorPicker({ label, value, onChange, alpha = false, variant = "field" }: Props) {
  const rgb = value.slice(0, 7).toUpperCase();
  const alphaSuffix = alpha && value.length === 9 ? value.slice(7) : "";
  const pick = (hex: string) => onChange(alpha ? hex.slice(0, 7).toUpperCase() + (hex.length === 9 ? hex.slice(7) : alphaSuffix) : hex.slice(0, 7).toUpperCase());

  async function eyedrop() {
    try {
      const { sRGBHex } = await new window.EyeDropper().open();
      pick(sRGBHex);
    } catch {
      // cancelled with Escape
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        {variant === "swatch" ? (
          <button type="button" title={label} aria-label={label} className="flex size-7 items-center justify-center rounded-md hover:bg-neutral-100">
            <span className="size-4 rounded-full ring-1 ring-black/20" style={{ background: value }} />
          </button>
        ) : (
          <button type="button" className="flex w-full items-center gap-2 rounded-lg py-0.5 text-left hover:bg-neutral-50">
            <span className="size-7 shrink-0 rounded-md ring-1 ring-neutral-300" style={{ background: value }} />
            <span className="text-neutral-600">{label}</span>
            <span className="ml-auto font-mono text-xs text-neutral-400">{rgb}</span>
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-60 space-y-3 p-3" collisionPadding={12} onPointerDown={(e) => e.stopPropagation()}>
        <p className="text-xs font-medium text-neutral-500">{label}</p>
        {alpha ? (
          <HexAlphaColorPicker color={value.length === 9 ? value : value + "FF"} onChange={pick} style={{ width: "100%", height: 150 }} />
        ) : (
          <HexColorPicker color={rgb} onChange={pick} style={{ width: "100%", height: 150 }} />
        )}
        <div className="grid grid-cols-10 gap-1">
          {SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              title={swatch}
              aria-label={swatch}
              onClick={() => pick(swatch)}
              className={`aspect-square rounded-full ring-1 ${swatch === rgb ? "ring-2 ring-ink ring-offset-1" : "ring-black/15"}`}
              style={{ background: swatch }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <HexColorInput
            color={alpha ? value : rgb}
            onChange={pick}
            alpha={alpha}
            prefixed
            aria-label={`${label} (hex)`}
            className="h-8 w-full rounded-lg px-2 font-mono text-xs uppercase ring-1 ring-neutral-200 outline-none focus:ring-2 focus:ring-flits"
          />
          {"EyeDropper" in window && (
            <button
              type="button"
              title="Kleur van het scherm pakken"
              aria-label="Kleur van het scherm pakken"
              onClick={() => void eyedrop()}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-neutral-200 hover:bg-neutral-50"
            >
              <Pipette size={14} />
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
