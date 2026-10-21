import { Input } from './input';

interface PriceRangeInputProps {
  min: string;
  max: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
}

export function PriceRangeInput({ min, max, onMinChange, onMaxChange }: PriceRangeInputProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Input label="Min price" inputMode="decimal" value={min} onChange={(event) => onMinChange(event.target.value)} />
      <Input label="Max price" inputMode="decimal" value={max} onChange={(event) => onMaxChange(event.target.value)} />
    </div>
  );
}
