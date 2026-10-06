import { useState, useRef } from 'react';
import { Drumstick, Beef, Fish, Egg, Tag } from 'lucide-react';
import type { ProductVariant } from '../types/billing.types';

interface ProductCardProps {
  variant: ProductVariant;
  quickNumber: number;
  selected: boolean;
  onClick: () => void;
}

const categoryIconMap: Record<string, any> = { Chicken: Drumstick, Mutton: Beef, Seafood: Fish, Eggs: Egg };

export default function ProductCard({ variant, quickNumber, selected, onClick }: ProductCardProps) {
  const IconComponent = categoryIconMap[variant.category] || Tag;
  const [isHovered, setIsHovered] = useState(false);
  const [titleOverflow, setTitleOverflow] = useState(0);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (titleRef.current) {
      const diff = titleRef.current.scrollWidth - titleRef.current.clientWidth;
      if (diff > 2) {
        setTitleOverflow(diff);
      } else {
        setTitleOverflow(0);
      }
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  const codeDisplay = variant.product_code || quickNumber;
  const isWeight = variant.unit_type === 'weight' || variant.unit_type === 'live_dual';
  const unitLabel = isWeight ? '/kg' : '/pc';
  const priceDisplay = `₹${(variant.current_rate_paise_per_unit / 100).toFixed(0)}${unitLabel}`;

  return (
    <button
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`group flex flex-col justify-between w-full h-[100px] border p-3 text-left rounded-lg active:scale-[0.98] transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-500 overflow-hidden ${
        selected
          ? 'bg-brand-500/10 border-brand-500 ring-1 ring-brand-500'
          : 'bg-surface-card border-border-subtle hover:border-border-focus hover:bg-surface-hover'
      }`}
    >
      <div className="w-full flex items-start justify-between flex-shrink-0">
        <div className="flex items-center gap-1.5 text-text-secondary min-w-0">
          <IconComponent size={14} className="text-brand-500 flex-shrink-0" />
          <span className="text-[9px] font-bold uppercase tracking-wider text-text-muted truncate">{variant.category}</span>
        </div>
        <span className="flex items-center justify-center min-w-6 h-5 px-1.5 rounded bg-surface-panel border border-border-subtle text-brand-500 text-[11px] font-mono font-extrabold flex-shrink-0">
          #{codeDisplay}
        </span>
      </div>

      <div className="mt-1 flex-1 min-w-0 w-full overflow-hidden">
        <div className="overflow-hidden w-full relative">
          <h4
            ref={titleRef}
            style={
              isHovered && titleOverflow > 0
                ? { transform: `translateX(-${titleOverflow + 6}px)`, transition: 'transform 2.5s ease-in-out' }
                : { transform: 'translateX(0)', transition: 'transform 0.3s ease-out' }
            }
            className={`text-xs font-extrabold text-text-primary leading-tight group-hover:text-brand-500 whitespace-nowrap ${
              titleOverflow > 0 && !isHovered ? 'truncate' : ''
            }`}
          >
            {variant.product_name}
          </h4>
        </div>
        <p className="text-[10px] text-text-muted font-semibold truncate mt-0.5">{variant.variant_name}</p>
      </div>

      <div className="w-full flex items-center justify-between text-[9px] font-bold uppercase flex-shrink-0 pt-1 border-t border-border-subtle/40">
        <span className="text-brand-500 font-mono">{priceDisplay}</span>
        <span className="text-text-muted font-mono font-bold">Code #{codeDisplay}</span>
      </div>
    </button>
  );
}
