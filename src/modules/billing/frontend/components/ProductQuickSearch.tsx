import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Hash, X } from 'lucide-react';
import { useActiveRates } from '../hooks/useActiveRates';
import type { ProductVariant } from '../types/billing.types';

interface ProductQuickSearchProps {
  onAddProduct: (variant: ProductVariant, quantityGrams: number | null, quantityUnits: number | null) => Promise<void>;
  selectedVariant: ProductVariant | null;
  onSelectVariant: (variant: ProductVariant | null) => void;
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
}

export default function ProductQuickSearch({
  onAddProduct,
  selectedVariant,
  onSelectVariant,
  searchTerm,
  onSearchTermChange,
}: ProductQuickSearchProps) {
  const { data: variants } = useActiveRates();
  const [quantityInput, setQuantityInput] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [error, setError] = useState('');
  const productInputRef = useRef<HTMLInputElement>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);

  const quickVariants = useMemo(
    () =>
      [...(variants ?? [])].sort((a, b) => {
        const numA = Number(a.product_code?.replace(/\D/g, '') || a.id);
        const numB = Number(b.product_code?.replace(/\D/g, '') || b.id);
        return numA - numB;
      }),
    [variants]
  );

  useEffect(() => {
    productInputRef.current?.focus();
    const timer1 = setTimeout(() => productInputRef.current?.focus(), 50);
    const timer2 = setTimeout(() => productInputRef.current?.focus(), 200);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  const focusQuantityInput = () => {
    setQuantityInput('');
    setAmountInput('');
    setError('');
    requestAnimationFrame(() => {
      quantityInputRef.current?.focus();
      quantityInputRef.current?.select();
    });
    setTimeout(() => {
      quantityInputRef.current?.focus();
      quantityInputRef.current?.select();
    }, 50);
  };

  useEffect(() => {
    let t: NodeJS.Timeout | undefined;
    if (selectedVariant) {
      setQuantityInput('');
      setAmountInput('');
      setError('');
      requestAnimationFrame(() => {
        quantityInputRef.current?.focus();
        quantityInputRef.current?.select();
      });
      t = setTimeout(() => {
        quantityInputRef.current?.focus();
        quantityInputRef.current?.select();
      }, 50);
    } else {
      requestAnimationFrame(() => productInputRef.current?.focus());
    }
    return () => {
      if (t) clearTimeout(t);
    };
  }, [selectedVariant]);

  const handleEscape = () => {
    if (selectedVariant) {
      onSelectVariant(null);
      setQuantityInput('');
      setAmountInput('');
      setError('');
    }
    onSearchTermChange('');
    requestAnimationFrame(() => productInputRef.current?.focus());
  };

  const chooseByNumber = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      handleEscape();
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const rawTerm = searchTerm.trim();
    const cleanTerm = rawTerm.replace(/^#\s*/, '').trim();
    if (!cleanTerm && !rawTerm) return;

    // Normalize code: strip leading zeros and PRD- prefix if any
    const normalizedTerm = cleanTerm.replace(/^prd-0*/i, '').replace(/^0+/, '');

    // 1. Try match by direct variant product_code (e.g. "1", "2", "11") or variant ID
    const matchByCode = quickVariants.find(v => {
      const pCode = (v.product_code || '').trim().toLowerCase();
      const normPCode = pCode.replace(/^prd-0*/i, '').replace(/^0+/, '');
      const strId = String(v.id);
      return (
        pCode === cleanTerm.toLowerCase() ||
        pCode === rawTerm.toLowerCase() ||
        (normalizedTerm !== '' && (normPCode === normalizedTerm || pCode === normalizedTerm || strId === normalizedTerm))
      );
    });

    if (matchByCode) {
      onSelectVariant(matchByCode);
      focusQuantityInput();
      return;
    }

    // 2. If input is purely numeric and has no product linked to it, reject immediately
    if (/^\d+$/.test(normalizedTerm || cleanTerm)) {
      setError(`Invalid invoice item: No product linked to code "${rawTerm}".`);
      return;
    }

    // 3. Try match by name contains (for text searches)
    const matchByName = quickVariants.find(v =>
      `${v.product_name} ${v.variant_name}`.toLowerCase().includes(cleanTerm.toLowerCase())
    );
    if (matchByName) {
      onSelectVariant(matchByName);
      focusQuantityInput();
      return;
    }

    setError(`Invalid invoice item: No product linked to code "${rawTerm}".`);
  };

  const addSelectedProduct = async (source: 'quantity' | 'amount') => {
    if (!selectedVariant) return;
    const entered = Number(source === 'quantity' ? quantityInput : amountInput);
    if (!Number.isFinite(entered) || entered <= 0) {
      setError(`Enter a valid ${source}.`);
      return;
    }
    const rate = selectedVariant.current_rate_paise_per_unit;
    const isWeightType = selectedVariant.unit_type === 'weight' || selectedVariant.unit_type === 'live_dual';
    const storedQuantity = source === 'amount'
      ? (isWeightType ? Math.round((entered * 100 * 1000) / rate) : Math.round((entered * 100) / rate))
      : (isWeightType ? Math.round(entered * 1000) : Math.round(entered));
    
    if (storedQuantity <= 0) {
      setError('Amount is too small for this product.');
      return;
    }
    
    try {
      await onAddProduct(
        selectedVariant,
        isWeightType ? storedQuantity : null,
        selectedVariant.unit_type === 'piece' ? storedQuantity : null
      );
      onSelectVariant(null);
      setQuantityInput('');
      setAmountInput('');
      onSearchTermChange('');
      setError('');
      requestAnimationFrame(() => productInputRef.current?.focus());
      setTimeout(() => productInputRef.current?.focus(), 50);
    } catch (err: any) {
      setError(err.message || 'Could not add this product to the bill.');
    }
  };

  const quickIndex = selectedVariant ? quickVariants.findIndex(v => v.id === selectedVariant.id) : -1;

  return (
    <div className="p-3.5 bg-surface-panel border-b border-border-subtle space-y-2.5 flex-shrink-0">
      <div className="flex items-center justify-between">
        <label className="text-[10px] uppercase font-bold tracking-wider text-brand-500 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
          Product Quick Search & Selection
        </label>
        {selectedVariant && (
          <button
            onClick={() => onSelectVariant(null)}
            className="text-[10px] text-text-muted hover:text-text-primary flex items-center gap-1 bg-surface-card px-2 py-0.5 rounded border border-border-subtle"
          >
            <X size={12} /> Clear Selection
          </button>
        )}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            id="quick-product-search-input"
            ref={productInputRef}
            inputMode="numeric"
            value={searchTerm}
            onChange={event => {
              onSearchTermChange(event.target.value);
              setError('');
            }}
            onKeyDown={chooseByNumber}
            placeholder="Enter bill code / quick # (e.g. 1, 2...), then Enter"
            className="w-full pl-9 pr-3 py-2 bg-surface-card border border-border-subtle rounded-lg text-sm font-bold font-mono text-text-primary outline-none focus:border-brand-500"
          />
        </div>
      </div>

      {selectedVariant && (
        <div className="rounded-lg border border-brand-500 bg-brand-500/10 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-extrabold text-text-primary">
              #{selectedVariant.product_code || (quickIndex !== -1 ? quickIndex + 1 : '')} · {selectedVariant.product_name} {selectedVariant.variant_name && selectedVariant.variant_name !== 'Standard' && selectedVariant.variant_name !== 'Default' ? `— ${selectedVariant.variant_name}` : ''}
            </p>
            <span className="text-[11px] font-bold text-brand-500 font-mono">
              ₹{(selectedVariant.current_rate_paise_per_unit / 100).toFixed(2)} / {(selectedVariant.unit_type === 'weight' || selectedVariant.unit_type === 'live_dual') ? 'kg' : 'pc'}
            </span>
          </div>
          <p className="text-[10px] text-text-muted mt-1">
            Enter quantity or total amount below, then press Enter to add to active bill sequence.
          </p>

          <div className="grid grid-cols-2 gap-2 mt-2">
            <input
              ref={quantityInputRef}
              inputMode="decimal"
              value={quantityInput}
              onChange={event => setQuantityInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  handleEscape();
                } else if (event.key === 'Enter') {
                  event.preventDefault();
                  addSelectedProduct('quantity');
                }
              }}
              placeholder={(selectedVariant.unit_type === 'weight' || selectedVariant.unit_type === 'live_dual') ? 'Quantity in KG (e.g. 1.5)' : 'Quantity in Pieces'}
              className="rounded-lg bg-surface-card border border-border-subtle px-3 py-2 text-xs font-mono text-text-primary outline-none focus:border-brand-500"
            />
            <input
              inputMode="decimal"
              value={amountInput}
              onChange={event => setAmountInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  handleEscape();
                } else if (event.key === 'Enter') {
                  event.preventDefault();
                  addSelectedProduct('amount');
                }
              }}
              placeholder="Total Amount in ₹ (e.g. 250)"
              className="rounded-lg bg-surface-card border border-border-subtle px-3 py-2 text-xs font-mono text-text-primary outline-none focus:border-brand-500"
            />
          </div>
        </div>
      )}

      {error && <p className="text-xs font-semibold text-red-400">{error}</p>}
    </div>
  );
}
