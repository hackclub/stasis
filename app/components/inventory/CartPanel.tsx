'use client';

interface CartItem {
  itemId: string;
  name: string;
  quantity: number;
}

interface CartPanelProps {
  items: CartItem[];
  onUpdateQuantity: (itemId: string, qty: number) => void;
  onRemove: (itemId: string) => void;
  onCheckout: () => void;
  disabled?: boolean;
}

export function CartPanel({ items, onUpdateQuantity, onRemove, onCheckout, disabled }: CartPanelProps) {
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const isEmpty = items.length === 0;

  return (
    <div className="bg-cream-100 border-2 border-brown-800 p-4">
      <h3 className="text-brown-800 font-bold text-sm uppercase tracking-wide mb-4">Cart</h3>

      {isEmpty ? (
        <p className="text-brown-800/50 text-sm">No items in cart.</p>
      ) : (
        <ul className="space-y-3 mb-4">
          {items.map(item => (
            <li key={item.itemId} className="flex items-center justify-between gap-2">
              <span className="text-brown-800 text-sm truncate flex-1">{item.name}</span>
              <div className="flex items-center gap-1">
                <div className="flex items-center border border-brown-800">
                  <button
                    onClick={() => onUpdateQuantity(item.itemId, item.quantity - 1)}
                    disabled={item.quantity <= 1}
                    className="px-1.5 py-0.5 text-xs text-brown-800 hover:bg-cream-200 disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    -
                  </button>
                  <span className="px-2 py-0.5 text-xs text-brown-800 min-w-[1.5rem] text-center">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => onUpdateQuantity(item.itemId, item.quantity + 1)}
                    className="px-1.5 py-0.5 text-xs text-brown-800 hover:bg-cream-200 transition-colors cursor-pointer"
                  >
                    +
                  </button>
                </div>
                <button
                  onClick={() => onRemove(item.itemId)}
                  className="px-1.5 py-0.5 text-xs text-brown-800/50 hover:text-orange-500 transition-colors cursor-pointer"
                  title="Remove"
                >
                  x
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-cream-400 pt-3 mt-3">
        <div className="flex justify-between text-sm text-brown-800 mb-3">
          <span>Total items</span>
          <span className="font-bold">{totalItems}</span>
        </div>
        <button
          onClick={onCheckout}
          disabled={isEmpty || disabled}
          className="w-full py-2 text-sm uppercase tracking-wider border-2 border-brown-800 bg-orange-500 text-cream-50 hover:bg-orange-600 disabled:opacity-30 disabled:hover:bg-orange-500 transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          Checkout
        </button>
      </div>
    </div>
  );
}
