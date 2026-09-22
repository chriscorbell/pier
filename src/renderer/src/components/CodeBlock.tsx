import { useRef, useState, type ComponentProps } from "react";
import { Check, Copy, WrapText } from "lucide-react";
import { useApp } from "@/store/app";
import { copyText } from "@/components/CopyMenu";
import { cn } from "@/lib/utils";

/** The slice of a hast node this component reads; react-markdown passes the full element as `node`. */
interface HastNode {
  type: string;
  value?: string;
  children?: HastNode[];
}

/** Plain text of a hast subtree, for copying a code block's source. */
function hastText(node: HastNode | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.value ?? "";
  return node.children?.map(hastText).join("") ?? "";
}

/**
 * Fenced code in the transcript. The corner toolbar appears on hover: toggle soft wrap (long lines
 * scroll sideways by default) and copy the block's source.
 */
export function CodeBlock({ node, children, className, ...rest }: ComponentProps<"pre"> & { node?: HastNode }) {
  const pushToast = useApp((s) => s.pushToast);
  const [wrap, setWrap] = useState(false);
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const source = hastText(node).replace(/\n$/, "");

  const copy = () => {
    void copyText(source, (m) => pushToast(m, "warning")).then(() => {
      setDone(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setDone(false), 1200);
    });
  };

  return (
    <div className="group/code relative">
      <pre {...rest} className={cn(className, wrap && "whitespace-pre-wrap break-words")}>
        {children}
      </pre>
      <div
        className={cn(
          "absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded-md border border-border bg-code-bg/90 p-0.5 opacity-0 backdrop-blur-sm transition-opacity duration-100 group-hover/code:opacity-100 focus-within:opacity-100",
          done && "opacity-100",
        )}
      >
        <button
          onClick={() => setWrap((w) => !w)}
          aria-label={wrap ? "Disable word wrap" : "Enable word wrap"}
          aria-pressed={wrap}
          title={wrap ? "Disable word wrap" : "Word wrap"}
          className={cn(
            "inline-flex h-6 w-6 items-center justify-center rounded text-fg-faint transition-colors duration-100 hover:bg-hover hover:text-fg",
            wrap && "bg-active text-fg",
          )}
        >
          <WrapText className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
        <button
          onClick={copy}
          aria-label="Copy code"
          title="Copy code"
          className={cn("inline-flex h-6 w-6 items-center justify-center rounded text-fg-faint transition-colors duration-100 hover:bg-hover hover:text-fg", done && "text-ok")}
        >
          {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.25} /> : <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />}
        </button>
      </div>
    </div>
  );
}
