import type { DragEvent } from "react";
import type { ProductBadgeState, ConfigBox } from "../../features/configurator/types";

interface ProductCardProps {
  box: ConfigBox;
  isAdded: boolean;
  isRequired: boolean;
  isLocked: boolean;
  showPrice?: boolean;
  badgeState: ProductBadgeState;
  lockMessage?: string;
  onAdd: () => void;
  onDragStart?: (event: DragEvent<HTMLButtonElement>) => void;
}

export function ProductCard({
  box,
  isAdded,
  isRequired,
  isLocked,
  showPrice = true,
  badgeState,
  lockMessage,
  onAdd,
  onDragStart,
}: ProductCardProps) {
  return (
    <button
      type="button"
      className={`cfg-box ${box.isBundle ? "cfg-box--bundle" : ""} ${isLocked ? "is-locked" : ""} ${isAdded ? "is-added" : ""} ${isRequired ? "is-required" : ""}`}
      draggable={!isLocked}
      disabled={isLocked}
      onDragStart={onDragStart}
      onClick={onAdd}
      title={isLocked ? lockMessage : undefined}
    >
      <div className="cfg-box__top">
        <span className={`cfg-box__period-badge cfg-box__period-badge--${box.period}`}>
          {box.period === "monthly" ? "M" : "·"}
        </span>
        {badgeState.badges.map((badge) => (
          <span key={badge} className={`cfg-badge cfg-badge--${badge.toLowerCase()}`}>
            {badge}
          </span>
        ))}
      </div>
      <div className="cfg-box__label">{box.label}</div>
      {!!box.desc && <div className="cfg-box__desc">{box.desc}</div>}
      {showPrice && (
        <div className="cfg-box__price">
          {typeof box.price === "number" ? (
            <>
              €{box.price}
              <small>{box.period === "monthly" ? "/mese" : "una tantum"}</small>
            </>
          ) : (
            "Prezzo non disponibile"
          )}
        </div>
      )}
      {!!lockMessage && <div className="cfg-box__warning">{lockMessage}</div>}
    </button>
  );
}
