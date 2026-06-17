interface AvatarProps {
  name: string;
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

export function Avatar({ name, size = "md", className = "" }: AvatarProps) {
  return (
    <span
      aria-label={name}
      className={`inline-grid place-items-center rounded-full bg-ink text-paper font-display font-bold flex-shrink-0 ${sizeMap[size]} ${className}`}
    >
      {getInitials(name)}
    </span>
  );
}
