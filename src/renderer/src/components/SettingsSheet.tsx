import { useEffect, useState } from "react";
import { useApp } from "@/store/app";
import { bridge } from "@/lib/bridge";
import type { SystemFont } from "@shared/contract";
import { Button, Field, Select, Sheet, Switch } from "@/components/ui";
import { DEFAULT_THEME, MATCH_INTERFACE, THEMES } from "@/lib/themes";

const UI_SIZES = [11, 12, 13, 14, 15, 16, 17, 18];
const TERMINAL_SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20];

/** A family picker over the installed fonts. Monospace families are listed first for the terminal. */
function FontSelect({
  value,
  fonts,
  defaultLabel,
  monoFirst,
  onChange,
}: {
  value: string | null;
  fonts: SystemFont[] | null;
  defaultLabel: string;
  monoFirst?: boolean;
  onChange: (family: string | null) => void;
}) {
  const mono = monoFirst ? fonts?.filter((f) => f.monospace) ?? [] : [];
  const rest = monoFirst ? fonts?.filter((f) => !f.monospace) ?? [] : fonts ?? [];
  const option = (f: SystemFont) => (
    <option key={f.family} value={f.family}>
      {f.family}
    </option>
  );
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="h-7 w-[168px] rounded-md border border-border-strong bg-surface-raised px-2 text-ui-[13.5px] text-fg focus-visible:outline-none focus-visible:border-focus"
    >
      <option value="">{defaultLabel}</option>
      {fonts === null && value && <option value={value}>{value}</option>}
      {monoFirst ? (
        <>
          <optgroup label="Monospace">{mono.map(option)}</optgroup>
          <optgroup label="All fonts">{rest.map(option)}</optgroup>
        </>
      ) : (
        rest.map(option)
      )}
    </select>
  );
}

const DARK_THEMES = THEMES.filter((t) => t.appearance === "dark");
const LIGHT_THEMES = THEMES.filter((t) => t.appearance === "light");

function ThemeSelect({ value, onChange, groups, defaultLabel }: { value: string; onChange: (id: string) => void; groups: { label: string; themes: typeof THEMES }[]; defaultLabel: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 w-[168px] rounded-md border border-border-strong bg-surface-raised px-2 text-ui-[13.5px] text-fg focus-visible:outline-none focus-visible:border-focus"
    >
      <option value={groups.length > 1 ? MATCH_INTERFACE : DEFAULT_THEME}>{defaultLabel}</option>
      {groups.map((g) =>
        groups.length > 1 ? (
          <optgroup key={g.label} label={g.label}>
            {g.themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </optgroup>
        ) : (
          g.themes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))
        ),
      )}
    </select>
  );
}

function SizeSelect({ value, sizes, onChange }: { value: number; sizes: number[]; onChange: (n: number) => void }) {
  const list = sizes.includes(value) ? sizes : [...sizes, value].sort((a, b) => a - b);
  return (
    <Select value={String(value)} onChange={(v) => onChange(Number(v))} options={list.map((n) => ({ value: String(n), label: `${n} px` }))} />
  );
}

export function SettingsSheet() {
  const open = useApp((s) => s.settingsOpen);
  const setOpen = useApp((s) => s.setSettingsOpen);
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);
  const upd = useApp((s) => s.update);
  const checkForUpdates = useApp((s) => s.checkForUpdates);
  const [located, setLocated] = useState<string | null>(null);
  const [piPath, setPiPath] = useState(settings.piPath ?? "");
  const [fonts, setFonts] = useState<SystemFont[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setPiPath(settings.piPath ?? "");
    void bridge.pi.locate().then(setLocated);
  }, [open, settings.piPath]);

  useEffect(() => {
    if (!open || fonts) return;
    void bridge.fonts.list().then(setFonts);
  }, [open, fonts]);

  return (
    <Sheet open={open} onOpenChange={setOpen} title="Settings">
      <div className="divide-y divide-border">
        <Field label="Appearance">
          <Select
            value={settings.theme}
            onChange={(v) => void update({ theme: v })}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </Field>
        <Field label="Dark theme" hint="Used whenever the appearance is dark.">
          <ThemeSelect value={settings.darkTheme} defaultLabel="Pier" groups={[{ label: "Dark", themes: DARK_THEMES }]} onChange={(v) => void update({ darkTheme: v })} />
        </Field>
        <Field label="Light theme" hint="Used whenever the appearance is light.">
          <ThemeSelect value={settings.lightTheme} defaultLabel="Pier" groups={[{ label: "Light", themes: LIGHT_THEMES }]} onChange={(v) => void update({ lightTheme: v })} />
        </Field>
        <Field label="Terminal theme" hint="Colors for the embedded shell.">
          <ThemeSelect
            value={settings.terminalTheme}
            defaultLabel="Match interface"
            groups={[
              { label: "Dark", themes: DARK_THEMES },
              { label: "Light", themes: LIGHT_THEMES },
            ]}
            onChange={(v) => void update({ terminalTheme: v })}
          />
        </Field>
        <Field label="Interface font" hint="Any installed font. The size scales the whole interface.">
          <div className="flex items-center gap-1.5">
            <FontSelect value={settings.uiFont} fonts={fonts} defaultLabel="System" onChange={(v) => void update({ uiFont: v })} />
            <SizeSelect value={settings.uiFontSize} sizes={UI_SIZES} onChange={(n) => void update({ uiFontSize: n })} />
          </div>
        </Field>
        <Field label="Terminal font">
          <div className="flex items-center gap-1.5">
            <FontSelect value={settings.terminalFont} fonts={fonts} defaultLabel="Default" monoFirst onChange={(v) => void update({ terminalFont: v })} />
            <SizeSelect value={settings.terminalFontSize} sizes={TERMINAL_SIZES} onChange={(n) => void update({ terminalFontSize: n })} />
          </div>
        </Field>
        <Field label="Expand thinking by default" hint="Collapsed blocks show a single line until clicked.">
          <Switch checked={settings.thinkingExpanded} onCheckedChange={(v) => void update({ thinkingExpanded: v })} />
        </Field>
        <Field label="Reduce motion" hint="Turns off transitions. The OS setting is honored regardless.">
          <Switch checked={settings.reduceMotion} onCheckedChange={(v) => void update({ reduceMotion: v })} />
        </Field>
        <Field label="Sounds" hint="A chime when a turn ends unseen, a ping when pi needs input.">
          <Switch checked={!settings.muted} onCheckedChange={(v) => void update({ muted: !v })} />
        </Field>
        <Field label="Diff layout">
          <Select
            value={settings.diffStyle}
            onChange={(v) => void update({ diffStyle: v })}
            options={[
              { value: "unified", label: "Unified" },
              { value: "split", label: "Split" },
            ]}
          />
        </Field>
        <Field
          label={`Pier ${upd.currentVersion || ""}`}
          hint={
            upd.status === "checking"
              ? "Checking GitHub for a newer release"
              : upd.status === "available"
                ? `${upd.latestVersion} is available`
                : upd.checkedAt
                  ? `Up to date, checked ${new Date(upd.checkedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                  : "Checks GitHub Releases on launch and every six hours"
          }
        >
          <Button size="sm" disabled={upd.status === "checking" || upd.status === "downloading"} onClick={() => void checkForUpdates()}>
            Check for updates
          </Button>
        </Field>
        <div className="py-2.5">
          <div className="text-ui-[14px]">pi binary</div>
          <div className="mb-2 text-ui-[12.5px] text-fg-muted">{located ? `Found at ${located}` : "Not found on PATH. Enter the full path."}</div>
          <input
            value={piPath}
            onChange={(e) => setPiPath(e.target.value)}
            onBlur={() => void update({ piPath: piPath.trim() || null })}
            placeholder="/opt/homebrew/bin/pi"
            className="h-8 w-full rounded-md border border-border-strong bg-bg-sunken px-2 font-mono text-ui-[13px] text-fg placeholder:text-fg-faint focus-visible:outline-none focus-visible:border-focus"
          />
        </div>
      </div>
    </Sheet>
  );
}
