import { cn } from "@/lib/utils";

/** The Pier mark: two joined pools and a floating drop, drawn in currentColor. */
export function Glyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 222.5 190.14" className={cn("h-4 w-4", className)} aria-hidden="true">
      <path
        fill="currentColor"
        d="M222.43,124.35c-.23-5.97-.32-11.87-1.83-17.8-7.61-30.03-41.94-55.79-79.63-46.02-8.07,2.09-16.17,3.96-24.61,3.32-10.73-.81-18.98-5.49-24.15-15.21-2.68-5.04-4.31-10.44-6.15-15.79C79.02,12.42,58.11-1.63,32.2,4.99,11.59,10.25-2.15,31.19,.28,52.16c2.51,21.67,20.67,38.68,42.32,39.43,6.32,.22,12.66-.18,18.98-.07,9.75,.17,17.06,4.57,22.33,12.81,5.39,8.43,6.87,17.94,8.06,27.5,1.93,15.47,8.09,29.16,19.48,39.48,21.09,19.1,45.36,24.15,72.16,12.92,24.48-10.26,40.11-35.1,38.81-59.88Z"
      />
      <path
        fill="currentColor"
        d="M125.29,51.61c13.78-.32,24.84-11.98,24.71-26.07C149.88,11.14,138.2-.22,123.73,0c-13.87,.21-25.25,11.67-25.41,25.57-.17,14.55,12.09,26.39,26.97,26.04Z"
      />
    </svg>
  );
}

/** The mark on its dark tile, as used for the app icon. */
export function Mark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex h-5 w-5 items-center justify-center rounded-[5px] bg-[#1f1f1f] text-[#f4f4f5] ring-1 ring-white/10", className)}>
      <Glyph className="h-[62%] w-[62%]" />
    </span>
  );
}
