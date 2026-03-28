'use client';

interface CartItem {
  itemId: string;
  name: string;
  quantity: number;
}

interface CartTool {
  toolId: string;
  name: string;
}

interface CartPanelProps {
  items: CartItem[];
  tools: CartTool[];
  onUpdateQuantity: (itemId: string, qty: number) => void;
  onRemoveItem: (itemId: string) => void;
  onRemoveTool: (toolId: string) => void;
  onCheckout: () => void;
  disabled?: boolean;
  hasActiveOrder?: boolean;
}

export function CartPanel({ items, tools, onUpdateQuantity, onRemoveItem, onRemoveTool, onCheckout, disabled, hasActiveOrder }: CartPanelProps) {
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const isEmpty = items.length === 0 && tools.length === 0;

  return (
    <div className="bg-cream-100 border-2 border-brown-800 p-4">
      <h3 className="text-brown-800 font-bold text-sm uppercase tracking-wide mb-4">Cart</h3>

      {isEmpty ? (
        <p className="text-brown-800/50 text-sm">Nothing in cart.</p>
      ) : (
        <div className="space-y-4 mb-4">
          {items.length > 0 && (
            <ul className="space-y-3">
              {items.map(item => (
                <li key={item.itemId} className="flex items-center justify-between gap-2">
                  <span className="text-brown-800 text-sm truncate flex-1" title={item.name}>{item.name}</span>
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
                      onClick={() => onRemoveItem(item.itemId)}
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

          {tools.length > 0 && (
            <>
              {items.length > 0 && <div className="border-t border-cream-400" />}
              <ul className="space-y-2">
                {tools.map(tool => (
                  <li key={tool.toolId} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-1.5 py-0.5 text-[10px] uppercase tracking-wider bg-cream-200 border border-cream-400 text-brown-800/60 shrink-0">Rental</span>
                      <span className="text-brown-800 text-sm truncate" title={tool.name}>{tool.name}</span>
                    </div>
                    <button
                      onClick={() => onRemoveTool(tool.toolId)}
                      className="px-1.5 py-0.5 text-xs text-brown-800/50 hover:text-orange-500 transition-colors cursor-pointer shrink-0"
                      title="Remove"
                    >
                      x
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div className="border-t border-cream-400 pt-3 mt-3">
        {(totalItems > 0 || tools.length > 0) && (
          <div className="flex flex-col gap-1 text-sm text-brown-800 mb-3">
            {totalItems > 0 && (
              <div className="flex justify-between">
                <span>Parts</span>
                <span className="font-bold">{totalItems}</span>
              </div>
            )}
            {tools.length > 0 && (
              <div className="flex justify-between">
                <span>Tool rentals</span>
                <span className="font-bold">{tools.length}</span>
              </div>
            )}
          </div>
        )}
        <button
          onClick={onCheckout}
          disabled={isEmpty || disabled}
          className="w-full py-2 text-sm uppercase tracking-wider border-2 border-brown-800 bg-orange-500 text-cream-50 hover:bg-orange-600 disabled:opacity-30 disabled:hover:bg-orange-500 transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          Checkout
        </button>
        {hasActiveOrder && (
          <p className="text-brown-800/50 text-xs mt-2">Your team has an active parts order. You can place another once it is completed or cancelled.</p>
        )}
      </div>
    </div>
  );
}
