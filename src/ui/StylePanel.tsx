import { Trash, Upload } from "lucide-react";
import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { ANIMATIONS } from "../captions/animations";
import { ensureFont, nearestWeight, useFontFamilies } from "../captions/fonts";
import { PRESETS } from "../captions/presets";
import type { AnimationId, StylePreset } from "../project/types";
import { ColorPicker } from "./ColorPicker";
import { Button, Card, fieldClass, IconButton, Segmented, Slider, Switch } from "./kit";

type Props = {
  style: StylePreset;
  onStyle: (style: StylePreset, gesture?: string) => void;
  customPresets: StylePreset[];
  onSavePreset: (name: string) => Promise<void>;
  onDeletePreset: (id: string) => Promise<void>;
  /** Registers and stores an uploaded font file; resolves to its family name, rejects for invalid files. */
  onUploadFont: (file: File) => Promise<string>;
  onClearAccents: () => void;
};

type Tab = "text" | "effect" | "animation";

const WEIGHT_NAMES: Record<number, string> = { 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold", 800: "Extrabold", 900: "Black" };


// Memo: the editor re-renders every video frame, and this panel only depends on the style.
export const StylePanel = memo(function StylePanel({ style, onStyle, customPresets, onSavePreset, onDeletePreset, onUploadFont, onClearAccents }: Props) {
  const families = useFontFamilies();
  const [tab, setTab] = useState<Tab>("text");
  const [fontError, setFontError] = useState<string | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<StylePreset>, gesture?: string) => onStyle({ ...style, ...patch }, gesture);
  const weights = families.find((f) => f.family === style.font.family)?.weights ?? [style.font.weight];

  // Preset tiles preview in their own font.
  useEffect(() => {
    for (const p of PRESETS) ensureFont(p.font.family, p.font.weight).catch(() => {});
  }, []);

  async function upload(file: File | undefined) {
    if (!file) return;
    setFontError(null);
    try {
      const family = await onUploadFont(file);
      set({ font: { ...style.font, family, weight: 400 } });
    } catch {
      setFontError("Dit bestand is geen geldig lettertype (.ttf, .otf, .woff of .woff2).");
    }
  }

  async function savePreset() {
    const name = naming?.trim();
    setNaming(null);
    if (!name) return;
    try {
      await onSavePreset(name);
    } catch (e) {
      setFontError(`Preset niet opgeslagen: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center border-b border-neutral-100 px-4">
        <h2 className="text-[15px] font-semibold">Stijl</h2>
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="grid grid-cols-3 gap-2">
          {[...PRESETS, ...customPresets].map((p) => (
            <PresetTile key={p.id} preset={p} active={p.id === style.id} onClick={() => onStyle(p)} />
          ))}
        </div>
        {naming === null ? (
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setNaming(style.name)}>
              Opslaan als preset
            </Button>
            {style.id.startsWith("custom-") && (
              <IconButton label="Preset verwijderen" className="ring-1 ring-neutral-200" onClick={() => void onDeletePreset(style.id).catch((e) => setFontError(`Preset niet verwijderd: ${String(e)}`))}>
                <Trash size={15} />
              </IconButton>
            )}
          </div>
        ) : (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void savePreset();
            }}
          >
            <input autoFocus type="text" aria-label="Naam van de preset" className={fieldClass} value={naming} onChange={(e) => setNaming(e.target.value)} />
            <Button type="submit" variant="primary">
              Bewaar
            </Button>
          </form>
        )}

        {fontError && <p className="text-red-600">{fontError}</p>}
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "text", label: "Tekst" },
            { value: "effect", label: "Effect" },
            { value: "animation", label: "Animatie" },
          ]}
        />

        {tab === "text" && (
          <>
            <Card>
              <Field label="Lettertype">
                <div className="flex gap-2">
                  <select
                    className={fieldClass}
                    value={style.font.family}
                    onChange={(e) => set({ font: { ...style.font, family: e.target.value, weight: nearestWeight(e.target.value, style.font.weight) } })}
                  >
                    <optgroup label="Ingebouwd">
                      {families.filter((f) => !f.custom).map((f) => (
                        <option key={f.family}>{f.family}</option>
                      ))}
                    </optgroup>
                    {families.some((f) => f.custom) && (
                      <optgroup label="Eigen fonts">
                        {families.filter((f) => f.custom).map((f) => (
                          <option key={f.family}>{f.family}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <IconButton label="Eigen font uploaden" className="shrink-0 ring-1 ring-neutral-200" onClick={() => uploadRef.current?.click()}>
                    <Upload size={15} />
                  </IconButton>
                  <input ref={uploadRef} type="file" accept=".ttf,.otf,.woff,.woff2" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
                </div>
              </Field>
              <Field label="Dikte">
                <select className={fieldClass} value={style.font.weight} onChange={(e) => set({ font: { ...style.font, weight: Number(e.target.value) } })}>
                  {weights.map((w) => (
                    <option key={w} value={w}>
                      {WEIGHT_NAMES[w] ?? w}
                    </option>
                  ))}
                </select>
              </Field>
              <Slider label="Grootte" min={0.02} max={0.1} step={0.001} value={style.font.size} format={(v) => `${(v * 100).toFixed(1)}%`} onChange={(v) => set({ font: { ...style.font, size: v } }, "size")} />
              <ToggleRow label="Hoofdletters" checked={style.uppercase} onChange={(uppercase) => set({ uppercase })} />
            </Card>
            <Card>
              <div className="grid grid-cols-2 gap-3">
                <ColorPicker label="Tekst" value={style.textColor} onChange={(textColor) => set({ textColor }, "textColor")} />
                <ColorPicker label="Accent" value={style.accentColors[0] ?? style.textColor} onChange={(c) => set({ accentColors: [c, ...style.accentColors.slice(1)] }, "accent")} />
              </div>
            </Card>
            <Card>
              <p className="font-medium">Accenten</p>
              <Slider
                label="Automatisch bij"
                min={0}
                max={1}
                step={0.05}
                value={style.accentRate}
                format={(v) => (v === 0 ? "uit (handmatig)" : `${Math.round(v * 100)}% van de blokken`)}
                onChange={(accentRate) => set({ accentRate }, "accentRate")}
              />
              <Segmented<"color" | "box">
                value={style.accentBox ? "box" : "color"}
                onChange={(mode) => set({ accentBox: mode === "box" ? { textColor: "#16161A", padding: 0.14, radius: 0.18 } : null })}
                options={[
                  { value: "color", label: "Gekleurde tekst" },
                  { value: "box", label: "Blok achter woord" },
                ]}
              />
              {style.accentBox && (
                <>
                  <ColorPicker label="Tekst op het blok" value={style.accentBox.textColor} onChange={(textColor) => set({ accentBox: { ...style.accentBox!, textColor } }, "boxText")} />
                  <Slider label="Afronding" min={0} max={0.5} step={0.01} value={style.accentBox.radius} format={(v) => v.toFixed(2)} onChange={(radius) => set({ accentBox: { ...style.accentBox!, radius } }, "boxRadius")} />
                </>
              )}
              <Button className="w-full" onClick={onClearAccents}>
                Alle accenten wissen
              </Button>
              <p className="text-xs text-neutral-500">Het percentage kiest opnieuw voor alle blokken. Zelf een accent zetten: klik een blok aan in Ondertitels en klik op een woord.</p>
            </Card>
          </>
        )}

        {tab === "effect" && (
          <>
            <Card>
              <ToggleRow label="Rand" checked={!!style.stroke} onChange={(on) => set({ stroke: on ? { color: "#000000", width: 0.06 } : null })} />
              {style.stroke && (
                <>
                  <ColorPicker label="Kleur" value={style.stroke.color} onChange={(color) => set({ stroke: { ...style.stroke!, color } }, "strokeColor")} />
                  <Slider label="Dikte" min={0.01} max={0.15} step={0.005} value={style.stroke.width} format={(v) => v.toFixed(3)} onChange={(width) => set({ stroke: { ...style.stroke!, width } }, "strokeWidth")} />
                </>
              )}
            </Card>
            <Card>
              <ToggleRow label="Schaduw" checked={!!style.shadow} onChange={(on) => set({ shadow: on ? { color: "#000000A6", blur: 0.3, offsetY: 0.06 } : null })} />
              {style.shadow && (
                <>
                  <ColorPicker label="Kleur" alpha value={style.shadow.color} onChange={(color) => set({ shadow: { ...style.shadow!, color } }, "shadowColor")} />
                  <Slider label="Zachtheid" min={0} max={1} step={0.01} value={style.shadow.blur} format={(v) => v.toFixed(2)} onChange={(blur) => set({ shadow: { ...style.shadow!, blur } }, "shadowBlur")} />
                </>
              )}
            </Card>
            <Card>
              <ToggleRow
                label="Achtergrond"
                checked={!!style.background}
                onChange={(on) => set({ background: on ? { color: "#000000B3", padding: 0.3, radius: 0.25 } : null })}
              />
              {style.background && (
                <>
                  <ColorPicker label="Kleur" alpha value={style.background.color} onChange={(color) => set({ background: { ...style.background!, color } }, "bgColor")} />
                  <Slider label="Ruimte" min={0} max={0.8} step={0.01} value={style.background.padding} format={(v) => v.toFixed(2)} onChange={(padding) => set({ background: { ...style.background!, padding } }, "bgPadding")} />
                  <Slider label="Afronding" min={0} max={0.8} step={0.01} value={style.background.radius} format={(v) => v.toFixed(2)} onChange={(radius) => set({ background: { ...style.background!, radius } }, "bgRadius")} />
                </>
              )}
            </Card>
          </>
        )}

        {tab === "animation" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(ANIMATIONS) as [AnimationId, (typeof ANIMATIONS)[AnimationId]][]).map(([id, a]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => set({ animation: id })}
                  className={`h-10 rounded-lg px-2 font-medium ring-1 transition-colors ${
                    style.animation === id ? "bg-ink text-white ring-ink" : "bg-white ring-neutral-200 hover:ring-neutral-400"
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
            <Card>
              <ToggleRow label="Uitfaden aan het eind" checked={style.fadeOut} onChange={(fadeOut) => set({ fadeOut })} />
              <p className="text-xs text-neutral-500">Een caption vervaagt als er stilte of het einde van de video volgt.</p>
            </Card>
            <Card>
              <Slider label="Horizontaal" min={0.05} max={0.95} step={0.005} value={style.positionX} format={(v) => `${Math.round(v * 100)}%`} onChange={(positionX) => set({ positionX }, "positionX")} />
              <Slider label="Hoogte in beeld" min={0.1} max={0.9} step={0.005} value={style.positionY} format={(v) => `${Math.round(v * 100)}%`} onChange={(positionY) => set({ positionY }, "position")} />
            </Card>
            <Card>
              <p className="font-medium">Opknippen</p>
              <Slider label="Max woorden per blok" min={1} max={12} step={1} value={style.maxWordsPerGroup} format={String} onChange={(maxWordsPerGroup) => set({ maxWordsPerGroup }, "maxWords")} />
              <Slider label="Max tekens per regel" min={6} max={40} step={1} value={style.maxCharsPerLine} format={String} onChange={(maxCharsPerLine) => set({ maxCharsPerLine }, "maxChars")} />
              <Slider label="Max regels" min={1} max={3} step={1} value={style.maxLines} format={String} onChange={(maxLines) => set({ maxLines }, "maxLines")} />
              <p className="text-xs text-neutral-500">Wijzigen knipt de blokken opnieuw; handmatige timing gaat dan verloren (ongedaan maken kan).</p>
            </Card>
          </>
        )}
      </div>
    </div>
  );
});

function PresetTile({ preset, active, onClick }: { preset: StylePreset; active: boolean; onClick: () => void }) {
  const text = (t: string) => (preset.uppercase ? t.toLocaleUpperCase("nl") : t);
  return (
    <button type="button" onClick={onClick} className="group space-y-1 text-left">
      <span
        className={`flex aspect-[4/3] items-center justify-center rounded-lg bg-gradient-to-br from-neutral-700 to-neutral-900 ring-2 transition ${
          active ? "ring-flits" : "ring-transparent group-hover:ring-neutral-300"
        }`}
      >
        <span
          className="rounded px-1 text-[15px] leading-none"
          style={{
            fontFamily: `"${preset.font.family}"`,
            fontWeight: preset.font.weight,
            color: preset.textColor,
            background: preset.background?.color,
            WebkitTextStroke: preset.stroke ? `${Math.max(1, preset.stroke.width * 22)}px ${preset.stroke.color}` : undefined,
            paintOrder: "stroke fill",
            textShadow: preset.shadow ? `0 1px 4px ${preset.shadow.color}` : undefined,
          }}
        >
          {text("Hoi ")}
          <span
            style={
              preset.accentBox
                ? { background: preset.accentColors[0], color: preset.accentBox.textColor, WebkitTextStroke: "0", borderRadius: 4, padding: "0 3px" }
                : { color: preset.accentColors[0] }
            }
          >
            {text("Flits")}
          </span>
        </span>
      </span>
      <span className={`block truncate text-[11px] ${active ? "font-semibold text-ink" : "text-neutral-500"}`}>{preset.name}</span>
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-medium">{label}</span>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}
