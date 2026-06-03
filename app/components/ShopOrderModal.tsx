'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/app/components/Toast';
import type { HcaAddress } from '@/lib/hca';

interface ShopItem {
  id: string;
  name: string;
  description: string;
  longDescription: string | null;
  imageUrl: string | null;
  price: number;
  discountPrice: number | null;
  maxPerUser: number;
}

interface Props {
  item: ShopItem;
  bitsBalance: number;
  alreadyOwnedCount: number;
  onClose: () => void;
  onPlaced: (orderNumber: number, newBalance: number) => void;
}

const MANAGE_ADDRESSES_URL = 'https://auth.hackclub.com/addresses';

// Minimal US-friendly phone mask. Accepts anything the user types but formats
// the final E.164 on submit. Displayed chrome is the placeholder.
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length < 10) return null;
  // If the user typed a leading "+" keep it; otherwise assume US (+1) when 10.
  if (raw.trim().startsWith('+')) {
    return `+${digits}`;
  }
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

function isValidPhone(raw: string): boolean {
  return normalizePhone(raw) !== null;
}

function formatAddressLabel(addr: HcaAddress): string {
  const name = [addr.first_name, addr.last_name].filter(Boolean).join(' ');
  const parts = [addr.line_1, [addr.city, addr.state].filter(Boolean).join(', ')].filter(Boolean);
  return `${name ? name + ' — ' : ''}${parts.join(', ')}${addr.postal_code ? ' ' + addr.postal_code : ''}`.trim();
}

export default function ShopOrderModal({
  item,
  bitsBalance,
  alreadyOwnedCount,
  onClose,
  onPlaced,
}: Readonly<Props>) {
  const { showToast } = useToast();
  const modalRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  const [addresses, setAddresses] = useState<HcaAddress[] | null>(null);
  const [addressesLoading, setAddressesLoading] = useState(true);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');
  const [phone, setPhone] = useState('');
  const [phoneDirty, setPhoneDirty] = useState(false);

  const effectivePrice = item.discountPrice ?? item.price;
  const hasDiscount = item.discountPrice !== null && item.discountPrice < item.price;

  const showQuantity = item.maxPerUser !== 1;
  const perUserRemaining = item.maxPerUser > 0 ? Math.max(0, item.maxPerUser - alreadyOwnedCount) : Infinity;
  const affordable = Math.floor(bitsBalance / effectivePrice);
  const maxQuantity = Math.max(1, Math.min(affordable, perUserRemaining));
  const [quantity, setQuantity] = useState(1);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load HCA addresses on mount
  const loadAddresses = useCallback(async (force = false) => {
    setAddressesLoading(true);
    setAddressError(null);
    try {
      const res = await fetch(`/api/user/hca-addresses${force ? '?t=' + Date.now() : ''}`);
      if (!res.ok) {
        setAddressError('Could not load addresses from HCA');
        setAddresses([]);
        return;
      }
      const data = await res.json() as { addresses: HcaAddress[]; hcaAvailable: boolean };
      setAddresses(data.addresses);
      if (!data.hcaAvailable) {
        setAddressError('Hack Club Auth is not linked to your account');
      }
    } catch {
      setAddressError('Network error — could not load addresses');
      setAddresses([]);
    } finally {
      setAddressesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  // Pick default address + prefill phone once addresses load
  useEffect(() => {
    if (!addresses || addresses.length === 0) return;
    const primary = addresses.find((a) => a.primary) ?? addresses[0];
    setSelectedAddressId(primary.id);
    if (!phoneDirty && primary.phone_number) {
      setPhone(primary.phone_number);
    }
  }, [addresses, phoneDirty]);

  // When user switches address, re-seed phone from the new address (unless they've typed their own).
  const currentAddress = useMemo(
    () => addresses?.find((a) => a.id === selectedAddressId) ?? null,
    [addresses, selectedAddressId]
  );
  useEffect(() => {
    if (!currentAddress) return;
    if (!phoneDirty && currentAddress.phone_number) {
      setPhone(currentAddress.phone_number);
    }
  }, [currentAddress, phoneDirty]);

  // Clamp quantity if maxQuantity shrinks
  useEffect(() => {
    if (quantity > maxQuantity) setQuantity(Math.max(1, maxQuantity));
  }, [quantity, maxQuantity]);

  // Focus first input when addresses resolved
  useEffect(() => {
    if (!addressesLoading) {
      requestAnimationFrame(() => firstInputRef.current?.focus());
    }
  }, [addressesLoading]);

  // Keyboard: Esc closes (focus trap is handled via tabIndex on overlay).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        if (phoneDirty) {
          if (!confirm('Discard your changes?')) return;
        }
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [submitting, phoneDirty, onClose]);

  // Focus trap: send shift-tab / tab overflow back to first/last element.
  useEffect(() => {
    const root = modalRef.current;
    if (!root) return;
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusables = root.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const enabled = Array.from(focusables).filter((el) => !el.hasAttribute('disabled'));
      if (enabled.length === 0) return;
      const first = enabled[0];
      const last = enabled[enabled.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    root.addEventListener('keydown', onTab);
    return () => root.removeEventListener('keydown', onTab);
  }, []);

  const totalCost = effectivePrice * quantity;
  const balanceAfter = bitsBalance - totalCost;
  const insufficient = balanceAfter < 0;

  const canSubmit =
    !submitting &&
    !addressesLoading &&
    !!currentAddress &&
    isValidPhone(phone) &&
    !insufficient &&
    quantity >= 1 &&
    quantity <= maxQuantity;

  const handleSubmit = async () => {
    if (!canSubmit || !currentAddress) return;
    const normalizedPhone = normalizePhone(phone) ?? phone;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/shop/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopItemId: item.id,
          quantity,
          addressId: currentAddress.id,
          phoneOverride: normalizedPhone,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(typeof data.error === 'string' ? data.error : 'Order failed');
        return;
      }
      showToast(`Order #${data.orderNumber} placed`, { variant: 'success', durationMs: 5000 });
      onPlaced(data.orderNumber, data.newBalance);
      onClose();
    } catch {
      setSubmitError('Network error — could not place order');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      aria-modal="true"
      role="dialog"
    >
      <div
        className="absolute inset-0 bg-[#3D3229]/80"
        onClick={() => {
          if (submitting) return;
          if (phoneDirty && !confirm('Discard your changes?')) return;
          onClose();
        }}
      />

      <div
        ref={modalRef}
        className="relative bg-cream-100 border-2 border-brown-800 w-[min(960px,calc(100vw-2rem))] shadow-lg"
      >
        <button
          onClick={onClose}
          disabled={submitting}
          aria-label="Close"
          className="absolute -top-4 -right-4 w-10 h-10 flex items-center justify-center bg-cream-100 border border-cream-600 text-brown-800 hover:text-orange-500 text-lg leading-none cursor-pointer transition-colors disabled:opacity-50 z-20"
        >
          ×
        </button>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-0 max-h-[calc(100vh-2rem)] overflow-y-auto">
          {/* Left column: image + copy */}
          <div className="md:col-span-5 p-6 md:border-r border-cream-400 flex flex-col gap-4 min-w-0">
            <div className="relative">
              {item.imageUrl ? (
                <div className="aspect-video bg-cream-200 border border-cream-400 overflow-hidden shop-item-image">
                  <img src={item.imageUrl} alt="" className="w-full h-full object-contain relative z-[1]" />
                </div>
              ) : (
                <div className="aspect-video bg-cream-200 border border-cream-400 flex items-center justify-center shop-item-image">
                  <span className="text-cream-500 text-sm uppercase tracking-wider relative z-[1]">No image</span>
                </div>
              )}
              {hasDiscount && (
                <span className="absolute top-2 right-2 z-[2] bg-orange-500 text-cream-100 text-xs font-bold uppercase tracking-wider px-2 py-1">
                  {Math.round((1 - effectivePrice / item.price) * 100)}% off
                </span>
              )}
            </div>
            <div className="flex-1">
              <h2 className="text-2xl text-brown-800 mb-2">{item.name}</h2>
              <p className="text-brown-800 text-sm whitespace-pre-wrap">{item.description}</p>
              {item.longDescription && (
                <p className="text-brown-800/80 text-sm whitespace-pre-wrap mt-3">{item.longDescription}</p>
              )}
            </div>
            <p className="text-orange-500 font-bold text-xl">
              {hasDiscount ? (
                <>
                  {effectivePrice.toLocaleString()} Bits{item.maxPerUser === 1 ? '' : ' each'}
                  <span className="text-cream-500 line-through font-normal text-base ml-2">{item.price.toLocaleString()}</span>
                </>
              ) : (
                <>{item.price.toLocaleString()} Bits{item.maxPerUser === 1 ? '' : ' each'}</>
              )}
            </p>
          </div>

          {/* Right column: form */}
          <div className="md:col-span-7 p-6 flex flex-col gap-5 min-w-0">
            <h3 className="text-brown-800 text-xl uppercase tracking-wide">Complete your order</h3>

            {showQuantity && (
              <div>
                <label className="block text-sm uppercase tracking-wide mb-2 text-brown-800">Quantity</label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1 || submitting}
                    className="bg-cream-300 hover:bg-cream-400 disabled:opacity-50 w-10 h-10 flex items-center justify-center text-brown-800 text-xl cursor-pointer transition-colors"
                  >−</button>
                  <input
                    ref={firstInputRef}
                    type="number"
                    min={1}
                    max={maxQuantity}
                    value={quantity}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v) && v >= 1 && v <= maxQuantity) setQuantity(v);
                    }}
                    className="w-20 text-center px-3 py-2 bg-cream-50 border border-cream-600 text-brown-800 focus:outline-none focus:border-orange-500"
                  />
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
                    disabled={quantity >= maxQuantity || submitting}
                    className="bg-cream-300 hover:bg-cream-400 disabled:opacity-50 w-10 h-10 flex items-center justify-center text-brown-800 text-xl cursor-pointer transition-colors"
                  >+</button>
                  <span className="text-brown-800/70 text-xs uppercase tracking-wide">
                    {item.maxPerUser > 0 && `Max ${perUserRemaining} more`}
                  </span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm uppercase tracking-wide mb-2 text-brown-800">Phone number</label>
              <input
                type="tel"
                inputMode="tel"
                placeholder="+1 (555) 123-4567"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setPhoneDirty(true); }}
                className="w-full px-3 py-2 bg-cream-50 border border-cream-600 text-brown-800 focus:outline-none focus:border-orange-500"
              />
              {phone && !isValidPhone(phone) && (
                <p className="text-red-600 text-xs mt-1 uppercase tracking-wide">Enter a valid phone number (10+ digits)</p>
              )}
            </div>

            <div>
              <label className="block text-sm uppercase tracking-wide mb-2 text-brown-800">Shipping address</label>
              <div className="flex items-stretch gap-2 h-[42px]">
                {addressesLoading ? (
                  <div className="flex-1 min-w-0 px-3 flex items-center bg-cream-200 border border-cream-400 text-brown-800 text-sm">
                    Loading addresses…
                  </div>
                ) : !addresses || addresses.length === 0 ? (
                  <div className="flex-1 min-w-0 px-3 flex items-center bg-cream-200 border border-cream-400 text-brown-800 text-sm">
                    {addressError ?? 'No addresses on file.'}
                  </div>
                ) : (
                  <select
                    value={selectedAddressId}
                    onChange={(e) => setSelectedAddressId(e.target.value)}
                    className="flex-1 min-w-0 max-w-full px-3 bg-cream-50 border border-cream-600 text-brown-800 focus:outline-none focus:border-orange-500 truncate"
                  >
                    {addresses.map((a) => (
                      <option key={a.id} value={a.id}>
                        {formatAddressLabel(a)}{a.primary ? ' (Primary)' : ''}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => loadAddresses(true)}
                  disabled={addressesLoading}
                  title="Refresh from HCA"
                  aria-label="Refresh addresses from HCA"
                  className="shrink-0 w-10 flex items-center justify-center border border-cream-600 bg-cream-50 text-brown-800 hover:text-orange-500 cursor-pointer disabled:opacity-50 transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={addressesLoading ? 'animate-spin' : ''}>
                    <polyline points="23 4 23 10 17 10" />
                    <polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                </button>
              </div>
              <a href={MANAGE_ADDRESSES_URL} target="_blank" rel="noopener noreferrer" className="block text-orange-500 hover:underline text-xs uppercase tracking-wide mt-1.5">
                Manage my addresses →
              </a>
            </div>

            <div className="bg-cream-200 border border-cream-400 p-4 space-y-1">
              <div className="flex justify-between text-sm text-brown-800">
                <span>Item price</span>
                <span className="font-mono">
                  {hasDiscount ? (
                    <>
                      {effectivePrice.toLocaleString()} bits
                      <span className="text-cream-500 line-through ml-1">{item.price.toLocaleString()}</span>
                    </>
                  ) : (
                    <>{effectivePrice.toLocaleString()} bits</>
                  )}
                </span>
              </div>
              <div className="flex justify-between text-sm text-brown-800">
                <span>Quantity</span>
                <span className="font-mono">× {quantity}</span>
              </div>
              {hasDiscount && (
                <div className="flex justify-between text-sm text-orange-500">
                  <span>You save</span>
                  <span className="font-mono">{((item.price - effectivePrice) * quantity).toLocaleString()} bits</span>
                </div>
              )}
              <div className="flex justify-between text-base text-brown-800 font-bold border-t border-cream-400 pt-1 mt-1">
                <span>Total</span>
                <span className="font-mono">{totalCost.toLocaleString()} bits</span>
              </div>
            </div>

            <div className="flex justify-between text-sm text-brown-800/80">
              <span>Current balance</span>
              <span className="font-mono">{bitsBalance.toLocaleString()} bits</span>
            </div>
            {insufficient ? (
              <div className="bg-orange-500/15 border border-orange-500/40 px-3 py-2 -mt-3 text-orange-500 text-sm font-bold">
                You need {(totalCost - bitsBalance).toLocaleString()} more bits!
              </div>
            ) : (
              <div className="flex justify-between text-sm text-brown-800 font-bold -mt-4">
                <span>After order</span>
                <span className="font-mono">{balanceAfter.toLocaleString()} bits</span>
              </div>
            )}

            {submitError && (
              <p className="text-red-600 text-sm uppercase tracking-wide">{submitError}</p>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  if (submitting) return;
                  if (phoneDirty && !confirm('Discard your changes?')) return;
                  onClose();
                }}
                disabled={submitting}
                className="px-6 py-3 bg-cream-300 hover:bg-cream-400 text-brown-800 uppercase tracking-wide text-sm font-bold cursor-pointer disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="px-6 py-3 bg-orange-500 hover:bg-orange-600 text-cream-100 uppercase tracking-wide text-sm font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Placing order…' : 'Place order'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
