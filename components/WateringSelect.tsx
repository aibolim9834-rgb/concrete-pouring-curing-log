import { SelectHTMLAttributes } from 'react';
import { normalizeWatering, wateringOptions } from '@/lib/watering';

export function WateringSelect({ value, ...props }: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'multiple'> & { value: string }) {
  const current = normalizeWatering(value);
  return <select {...props} value={current}>
    <option value="">미입력</option>
    {current && !wateringOptions.includes(current) && <option value={current}>{current} (기존 내용)</option>}
    {wateringOptions.map(option => <option key={option} value={option}>{option}</option>)}
  </select>;
}
