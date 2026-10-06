import { useEffect, useState, type KeyboardEvent } from 'react';
import { Trash2, ShieldAlert, Layers } from 'lucide-react';
import type { InvoiceItem } from '../types/billing.types';
import { formatPaise } from '../types/billing.types';
import { useAppearance } from '../../../../core/theme/AppearanceContext';
import { useActiveRates } from '../hooks/useActiveRates';

interface CartLineItemProps {
  item: InvoiceItem;
  index: number;
  onEditQty: () => void;
  onIncrementPiece: (delta: number) => void;
  onSetQuantity: (quantity: number) => void;
  onRemove: () => void;
  removing: boolean;
  isGstInvoice: boolean;
  onOpenBatchPicker?: () => void;
}

export default function CartLineItem({ item, index, onSetQuantity, onRemove, removing, onOpenBatchPicker }: CartLineItemProps) {
  const { config } = useAppearance();
  const { data: variants } = useActiveRates();
  const matchedVariant = variants?.find(v => v.id === item.product_variant_id);

  const productName = item.product_name || matchedVariant?.product_name || 'Product';
  const variantName = item.variant_name || matchedVariant?.variant_name || '';
  const unitType = item.unit_type || matchedVariant?.unit_type || (item.quantity_grams !== null ? 'weight' : 'piece');

  const cartMode = config.cartDisplay || 'detailed';

  const isWeight = unitType === 'weight' || unitType === 'live_dual';
  const quantity = isWeight ? (item.quantity_grams ?? 0) / 1000 : item.quantity_units ?? 0;
  const amount = item.line_subtotal_paise / 100;
  const [quantityInput, setQuantityInput] = useState(String(quantity));
  const [amountInput, setAmountInput] = useState(amount.toFixed(2));

  useEffect(() => {
    setQuantityInput(String(quantity));
    setAmountInput(amount.toFixed(2));
  }, [quantity, amount]);

  const saveQuantity = () => {
    const entered = Number(quantityInput);
    if (!Number.isFinite(entered) || entered <= 0) return setQuantityInput(String(quantity));
    const storedQuantity = isWeight ? Math.round(entered * 1000) : Math.round(entered);
    if (storedQuantity > 0 && storedQuantity !== (isWeight ? item.quantity_grams : item.quantity_units)) onSetQuantity(storedQuantity);
  };

  const saveAmount = () => {
    const entered = Number(amountInput);
    if (!Number.isFinite(entered) || entered <= 0 || item.rate_paise_snapshot <= 0) return setAmountInput(amount.toFixed(2));
    const desiredPaise = Math.round(entered * 100);
    const storedQuantity = isWeight
      ? Math.round((desiredPaise * 1000) / item.rate_paise_snapshot)
      : Math.round(desiredPaise / item.rate_paise_snapshot);
    if (storedQuantity > 0 && storedQuantity !== (isWeight ? item.quantity_grams : item.quantity_units)) onSetQuantity(storedQuantity);
    else setAmountInput(amount.toFixed(2));
  };

  const submitOnEnter = (event: KeyboardEvent<HTMLInputElement>, save: () => void) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      save();
      (event.target as HTMLInputElement).blur();
      setTimeout(() => {
        const searchInput = document.getElementById('quick-product-search-input') as HTMLInputElement | null;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }, 0);
    }
  };

  // 1. Compact View Mode (Ultra-dense single row)
  if (cartMode === 'compact') {
    return (
      <div className={`bg-surface-card border rounded px-2 py-1 flex items-center justify-between gap-1.5 transition-all text-xs ${item.override_applied ? 'border-amber-500/50 bg-amber-950/20' : 'border-border-subtle hover:border-border-subtle/80'}`}>
        <div className="flex items-center gap-1 min-w-0 flex-1 truncate">
          <span className="text-[9px] font-mono text-text-muted w-3 flex-shrink-0">{(index + 1)}</span>
          <span className="font-extrabold text-text-primary truncate text-[11px]">
            {productName} {variantName && variantName !== 'Default' && variantName !== 'Standard' ? `— ${variantName}` : ''}
          </span>
          {item.stock_source === 'refrigerator' && (
            <span className="px-1 py-0.2 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30 text-[8.5px] font-black flex-shrink-0">
              🧊 Fridge
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <input
            inputMode="decimal"
            value={quantityInput}
            onChange={event => setQuantityInput(event.target.value)}
            onBlur={saveQuantity}
            onKeyDown={event => submitOnEnter(event, saveQuantity)}
            className="w-14 h-6 rounded bg-surface-panel border border-border-subtle px-1 text-center text-[11px] font-extrabold font-mono text-text-primary outline-none focus:border-brand-500"
          />
          <span className="text-[10px] font-bold text-text-secondary">{isWeight ? 'kg' : 'pc'}</span>

          <span className="text-[10px] font-bold text-text-muted font-mono">@{formatPaise(item.rate_paise_snapshot)}</span>

          <input
            inputMode="decimal"
            value={amountInput}
            onChange={event => setAmountInput(event.target.value)}
            onBlur={saveAmount}
            onKeyDown={event => submitOnEnter(event, saveAmount)}
            className="w-16 h-6 rounded bg-surface-panel border border-border-subtle px-1 text-right text-[11px] font-extrabold font-mono text-brand-500 outline-none focus:border-brand-500"
          />

          <button
            onClick={onRemove}
            disabled={removing}
            className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-red-400 transition-colors"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    );
  }

  // 2. Comfort View Mode (Standard view)
  if (cartMode === 'comfort') {
    return (
      <div className={`bg-surface-card border rounded-md px-2.5 py-1.5 flex items-center justify-between gap-2 transition-all ${item.override_applied ? 'border-amber-500/50 bg-amber-950/20' : 'border-border-subtle'}`}>
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="text-[10px] font-bold text-text-muted font-mono">{(index + 1).toString().padStart(2, '0')}</span>
          <span className="text-xs font-extrabold text-text-primary truncate">
            {productName} {variantName && variantName !== 'Default' && variantName !== 'Standard' ? `— ${variantName}` : ''}
          </span>
          {item.stock_source === 'refrigerator' && (
            <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30 text-[9px] font-black flex-shrink-0">
              🧊 Fridge
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[10px] font-bold font-mono text-text-secondary">
            @{formatPaise(item.rate_paise_snapshot)}
          </span>

          <input
            inputMode="decimal"
            value={quantityInput}
            onChange={event => setQuantityInput(event.target.value)}
            onBlur={saveQuantity}
            onKeyDown={event => submitOnEnter(event, saveQuantity)}
            className="w-16 h-7 rounded bg-surface-panel border border-border-subtle px-1.5 text-center text-xs font-extrabold font-mono text-text-primary outline-none focus:border-brand-500"
          />

          <input
            inputMode="decimal"
            value={amountInput}
            onChange={event => setAmountInput(event.target.value)}
            onBlur={saveAmount}
            onKeyDown={event => submitOnEnter(event, saveAmount)}
            className="w-18 h-7 rounded bg-surface-panel border border-border-subtle px-1.5 text-right text-xs font-extrabold font-mono text-brand-500 outline-none focus:border-brand-500"
          />

          <button
            onClick={onRemove}
            disabled={removing}
            className="h-7 w-7 flex items-center justify-center rounded text-text-muted hover:text-red-400 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    );
  }

  // 3. Detailed View Mode (Default full featured view)
  return (
    <div className={`bg-surface-card border rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2 transition-all duration-150 select-none ${item.override_applied ? 'border-amber-500/50 bg-amber-950/20' : 'border-border-subtle hover:border-border-subtle/80'}`}>
      {/* Product Info */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <span className="text-[10px] font-bold text-text-muted w-4 font-mono flex-shrink-0">{(index + 1).toString().padStart(2, '0')}</span>
        <div className="min-w-0 flex-1 truncate flex items-center gap-1.5">
          <span className="text-xs font-extrabold text-text-primary truncate">
            {productName}
          </span>
          {variantName && variantName !== 'Default' && variantName !== 'Standard' && (
            <span className="text-[11px] font-bold text-brand-500 truncate">({variantName})</span>
          )}
          {item.stock_source === 'refrigerator' && (
            <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30 text-[9px] font-black flex-shrink-0">
              🧊 Fridge Item
            </span>
          )}
          {item.override_applied === 1 && (
            <span title={`Rate Override: ${item.override_reason}`}>
              <ShieldAlert size={12} className="text-amber-400 flex-shrink-0" />
            </span>
          )}
          {item.manual_batch_allocations && item.manual_batch_allocations.length > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-400 border border-brand-500/30 text-[9px] font-extrabold flex-shrink-0">
              Manual Batch ({item.manual_batch_allocations.length})
            </span>
          )}
        </div>
      </div>

      {/* Inputs & Controls */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {onOpenBatchPicker && (
          <button
            type="button"
            onClick={onOpenBatchPicker}
            className={`h-7 px-1.5 rounded-md border flex items-center justify-center gap-1 text-[10.5px] font-bold transition-all ${
              item.manual_batch_allocations && item.manual_batch_allocations.length > 0
                ? 'bg-brand-500/20 border-brand-500 text-brand-400 font-extrabold'
                : 'bg-surface-panel border-border-subtle/80 text-text-muted hover:text-brand-500 hover:border-brand-500/50'
            }`}
            title="Select Batch (Manual Batch Drawdown)"
          >
            <Layers size={13} />
          </button>
        )}

        {/* Unit Rate Indicator Badge */}
        <span className="text-[10px] font-bold font-mono text-text-secondary bg-surface-panel border border-border-subtle/80 px-2 py-1 rounded-md whitespace-nowrap">
          @{formatPaise(item.rate_paise_snapshot)}/{isWeight ? 'kg' : 'pc'}
        </span>

        {/* Quantity Field */}
        <div className="flex items-center gap-1">
          <input
            aria-label={`Quantity for ${item.product_name}`}
            inputMode="decimal"
            value={quantityInput}
            onChange={event => setQuantityInput(event.target.value)}
            onBlur={saveQuantity}
            onKeyDown={event => submitOnEnter(event, saveQuantity)}
            className="w-20 h-7 rounded-md bg-surface-panel border border-border-subtle px-2 text-center text-xs font-extrabold font-mono text-text-primary outline-none focus:border-brand-500 transition-colors"
            title={`Edit Quantity (${isWeight ? 'kg' : 'pcs'})`}
          />
          <span className="text-xs font-extrabold uppercase text-text-secondary w-5">{isWeight ? 'KG' : 'PC'}</span>
        </div>

        {/* Amount Field */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-extrabold text-brand-500">₹</span>
          <input
            aria-label={`Amount for ${item.product_name}`}
            inputMode="decimal"
            value={amountInput}
            onChange={event => setAmountInput(event.target.value)}
            onBlur={saveAmount}
            onKeyDown={event => submitOnEnter(event, saveAmount)}
            className="w-20 h-7 rounded-md bg-surface-panel border border-border-subtle px-2 text-right text-xs font-extrabold font-mono text-brand-500 outline-none focus:border-brand-500 transition-colors"
            title="Edit Total Line Amount"
          />
        </div>

        {/* Remove Button */}
        <button
          onClick={onRemove}
          disabled={removing}
          className="h-7 w-7 flex items-center justify-center rounded-md text-text-muted hover:text-red-400 hover:bg-red-950/30 transition-colors disabled:opacity-40"
          title="Remove Item"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
