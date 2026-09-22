import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** A full-window preview of one image. Opens and closes with a short zoom from the center. */
export function Lightbox({ src, open, onOpenChange }: { src: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="lightbox-overlay fixed inset-0 z-40 bg-black/70 backdrop-blur-[3px]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="lightbox-content fixed inset-0 z-50 flex items-center justify-center p-8 focus:outline-none"
          onClick={() => onOpenChange(false)}
        >
          <Dialog.Title className="sr-only">Image preview</Dialog.Title>
          <img
            src={src}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="lightbox-img max-h-full max-w-full shadow-[var(--shadow)]"
          />
          <Dialog.Close
            aria-label="Close preview"
            className="no-drag absolute top-4 right-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white/80 transition-colors hover:bg-black/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** A square thumbnail that opens the Lightbox when clicked. Extra children overlay the thumbnail (e.g. a remove button). */
export function ImageThumb({ src, size = 56, className, children }: { src: string; size?: number; className?: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("group relative shrink-0 overflow-hidden rounded-md border border-border", className)} style={{ width: size, height: size }}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open image preview"
        className="block h-full w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus"
      >
        <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
      </button>
      {children}
      <Lightbox src={src} open={open} onOpenChange={setOpen} />
    </div>
  );
}
