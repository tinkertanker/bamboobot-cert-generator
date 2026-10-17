import React from 'react';

type Item<T extends string> = { label: string; value: T };

export default function Segmented<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
}: {
  items: Array<Item<T>>;
  value: T;
  onChange: (val: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div role="group" className="inline-flex rounded-md border border-gray-300 bg-white shadow-sm overflow-hidden" aria-label={ariaLabel}>
      {items.map((it, idx) => {
        const active = it.value === value;
        const rounded = idx === 0 ? 'rounded-l-md' : idx === items.length - 1 ? 'rounded-r-md' : '';
        return (
          <button
            key={it.value}
            type="button"
            onClick={() => onChange(it.value)}
            aria-pressed={active}
            className={`px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${rounded} ${
              active
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

