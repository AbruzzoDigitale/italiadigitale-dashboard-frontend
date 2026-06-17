import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

interface FadePresenceProps {
  show: boolean;
  children: ReactNode;
  className?: string;
  durationMs?: number;
  variant?: "fade" | "slide";
}

/**
 * Simple enter/exit presence animation without external dependencies.
 * Keeps the node mounted during exit to allow smooth fade-out.
 */
export function FadePresence({
  show,
  children,
  className = "",
  durationMs = 180,
  variant = "slide",
}: FadePresenceProps) {
  const [mounted, setMounted] = useState(show);
  const [entered, setEntered] = useState(show);

  useEffect(() => {
    if (show) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(raf);
    }

    setEntered(false);
    const timeout = window.setTimeout(() => setMounted(false), durationMs);
    return () => window.clearTimeout(timeout);
  }, [show, durationMs]);

  const style = useMemo(() => {
    return {
      ["--presence-duration" as string]: `${durationMs}ms`,
    } as CSSProperties;
  }, [durationMs]);

  if (!mounted) return null;

  return (
    <div
      className={`ui-presence ui-presence--${variant} ${entered ? "is-entered" : "is-exiting"} ${className}`.trim()}
      style={style}
    >
      {children}
    </div>
  );
}
