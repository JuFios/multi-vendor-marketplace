export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

interface FacetFilterProps {
  title: string;
  options: readonly FacetOption[];
  selected: string;
  onChange: (value: string) => void;
}

/** Single-choice facet; choosing the selected option again clears it. */
export function FacetFilter({ title, options, selected, onChange }: FacetFilterProps) {
  return (
    <fieldset className="space-y-1">
      <legend className="mb-1 text-sm font-semibold">{title}</legend>
      {options.length === 0 ? <p className="text-xs text-muted">Nothing to filter by</p> : null}
      {options.map((option) => {
        const checked = option.value === selected;
        return (
          <label key={option.value} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand"
                checked={checked}
                onChange={() => {
                  onChange(checked ? '' : option.value);
                }}
              />
              {option.label}
            </span>
            <span className="text-xs text-muted">{option.count}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
