export type FilterOption<T extends string> = { value: T; label: string };

interface Props<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: FilterOption<T>[];
}

export function FilterBar<T extends string>({ value, onChange, options }: Props<T>) {
  return (
    <div className="filter-bar" role="tablist" aria-label="Filter">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={opt.value === value}
          className={`filter-bar__chip ${opt.value === value ? 'filter-bar__chip--active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
