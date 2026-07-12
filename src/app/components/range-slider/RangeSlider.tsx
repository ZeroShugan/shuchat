import React from 'react';
import * as css from './styles.css';

type RangeSliderProps = {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  width?: string;
};

/**
 * Theme-matching replacement for raw `<input type="range">`.
 * The filled portion follows the folds Primary color in both engines
 * (gradient + `--rs-fill` on WebKit, `::-moz-range-progress` on Firefox).
 */
export function RangeSlider({ min, max, step, value, onChange, disabled, width }: RangeSliderProps) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <input
      type="range"
      className={css.RangeSlider}
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      style={{ width: width ?? '140px', '--rs-fill': `${pct}%` } as React.CSSProperties}
    />
  );
}
