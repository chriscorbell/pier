import { useEffect, useState } from "react";
import { Button, Sheet } from "@/components/ui";

/** Electron has no window.prompt, so rename and similar single-field asks use this sheet. */
export function PromptSheet({
  open,
  title,
  initial = "",
  placeholder,
  submitLabel = "Save",
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  initial?: string;
  placeholder?: string;
  submitLabel?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    if (open) setValue(initial);
  }, [open, initial]);
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={title}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(value);
        }}
      >
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="h-9 w-full rounded-md border border-border-strong bg-bg-sunken px-2.5 text-ui-[14px] text-fg placeholder:text-fg-faint focus-visible:outline-none focus-visible:border-focus"
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            {submitLabel}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

export function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  danger,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={title}>
      {message && <p className="mb-4 text-ui-[14px] text-fg-muted">{message}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant={danger ? "danger" : "primary"} autoFocus onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Sheet>
  );
}
