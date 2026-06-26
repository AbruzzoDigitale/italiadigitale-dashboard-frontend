import { useEffect, useState } from "react";

interface AvatarProps {
  name: string;
  /** URL immagine profilo; se assente o in errore mostra le iniziali. */
  src?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: "w-7 h-7 text-[11px]",
  md: "w-9 h-9 text-sm",
  lg: "w-16 h-16 text-2xl",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

export function Avatar({ name, src, size = "md", className = "" }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  const showImage = !!src && !failed;

  return (
    <span
      aria-label={name}
      className={`inline-grid place-items-center overflow-hidden rounded-full bg-ink text-paper font-display font-bold flex-shrink-0 ${sizeMap[size]} ${className}`}
    >
      {showImage ? (
        <img
          src={src!}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        getInitials(name)
      )}
    </span>
  );
}
