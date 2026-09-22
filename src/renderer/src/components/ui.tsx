import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "default", size = "md", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "no-drag inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-[background-color,transform,opacity] duration-100 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus",
        size === "sm" ? "h-7 px-2.5 text-ui-[13px]" : "h-8 px-3 text-ui-[14px]",
        variant === "default" && "border border-border-strong bg-surface-raised text-fg hover:bg-hover",
        variant === "primary" && "bg-accent text-accent-fg hover:brightness-110",
        variant === "ghost" && "text-fg-muted hover:bg-hover hover:text-fg",
        variant === "danger" && "bg-danger-soft text-danger hover:brightness-110",
        className,
      )}
      {...props}
    />
  );
});

type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean };

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, label, active, ...props },
  ref,
) {
  return (
    <Tip label={label}>
      <button
        ref={ref}
        aria-label={label}
        className={cn(
          "no-drag inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-colors duration-100 hover:bg-hover hover:text-fg active:bg-active disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus",
          active && "bg-active text-fg",
          className,
        )}
        {...props}
      />
    </Tip>
  );
});

export function Tip({ label, children, side = "bottom" }: { label: string; children: React.ReactElement; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <Tooltip.Root delayDuration={500}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          sideOffset={6}
          className="anim-fade-in z-50 rounded-md border border-border bg-surface-raised px-2 py-1 text-ui-[12px] text-fg shadow-[var(--shadow)]"
        >
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("anim-spin h-3.5 w-3.5", className)} strokeWidth={2} />;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border-strong bg-bg-sunken px-1 font-sans text-ui-[11px] text-fg-muted">
      {children}
    </kbd>
  );
}

// ---- Dropdown ----

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export function MenuContent({ className, children, ...props }: DropdownMenu.DropdownMenuContentProps) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        sideOffset={6}
        collisionPadding={8}
        className={cn(
          "anim-fade-up z-50 min-w-[180px] overflow-hidden rounded-lg border border-border bg-surface-raised p-1 shadow-[var(--shadow)]",
          className,
        )}
        {...props}
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

export function MenuItem({ className, ...props }: DropdownMenu.DropdownMenuItemProps) {
  return (
    <DropdownMenu.Item
      className={cn(
        "flex select-none items-center gap-2 rounded-md px-2 py-1.5 text-ui-[13.5px] text-fg outline-none data-[highlighted]:bg-hover data-[disabled]:opacity-40",
        className,
      )}
      {...props}
    />
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <DropdownMenu.Label className="px-2 pt-1.5 pb-1 text-ui-[11.5px] font-medium uppercase tracking-wide text-fg-faint">{children}</DropdownMenu.Label>;
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-border" />;
}

// ---- Dialog / sheet ----

export function Sheet({
  open,
  onOpenChange,
  title,
  eyebrow,
  description,
  children,
  width = 440,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  /** Small label above the title, such as a dialog's category. */
  eyebrow?: string;
  /** Body text between the title and the content. */
  description?: React.ReactNode;
  children: React.ReactNode;
  width?: number;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-fade-in fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" />
        <Dialog.Content
          style={{ width }}
          className="anim-fade-up fixed top-1/2 left-1/2 z-50 max-h-[80vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-surface-raised p-5 shadow-[var(--shadow)] focus:outline-none"
        >
          {eyebrow && <div className="mb-1 text-ui-[11.5px] font-medium tracking-wide text-fg-faint uppercase">{eyebrow}</div>}
          <Dialog.Title className={cn("text-ui-[15px] font-semibold leading-snug", description ? "mb-2" : "mb-4")}>{title}</Dialog.Title>
          {description && <div className="mb-4 text-ui-[13.5px] leading-relaxed text-fg-muted">{description}</div>}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Switch({ checked, onCheckedChange, id }: { checked: boolean; onCheckedChange: (v: boolean) => void; id?: string }) {
  return (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      className="relative h-5 w-9 shrink-0 rounded-full border border-border-strong bg-bg-sunken transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent focus-visible:outline-none focus-visible:border-focus"
    >
      <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </SwitchPrimitive.Root>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <div className="text-ui-[14px]">{label}</div>
        {hint && <div className="text-ui-[12.5px] text-fg-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Select<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="h-7 rounded-md border border-border-strong bg-surface-raised px-2 text-ui-[13.5px] text-fg focus-visible:outline-none focus-visible:border-focus"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <Tooltip.Provider>{children}</Tooltip.Provider>;
}
