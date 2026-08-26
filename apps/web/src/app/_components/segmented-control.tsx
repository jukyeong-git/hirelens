"use client";

import { useId, useRef } from "react";

export interface SegmentedOption<TValue extends string> {
  value: TValue;
  label: string;
  /** Second line inside the segment. Keep it to a short phrase. */
  hint?: string;
  tone?: "neutral" | "positive" | "caution" | "critical";
}

interface SegmentedControlProps<TValue extends string> {
  options: SegmentedOption<TValue>[];
  value: TValue | "";
  onChange: (value: TValue) => void;
  legend: string;
  /** Hides the legend visually while keeping it for assistive technology. */
  hiddenLegend?: boolean;
  disabled?: boolean;
  name?: string;
  columns?: 2 | 3 | 4;
}

/**
 * A radiogroup rendered as full-width buttons.
 *
 * The verdict choices are the most-used control in the product and are made
 * repeatedly under time pressure, so they are worth a large target with the
 * options visible at once — a dropdown hides them behind a click and gives no
 * sense of how many there are.
 */
export function SegmentedControl<TValue extends string>({
  options,
  value,
  onChange,
  legend,
  hiddenLegend = false,
  disabled = false,
  name,
  columns,
}: SegmentedControlProps<TValue>) {
  const groupId = useId();
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = options.findIndex((option) => option.value === value);

  // Arrow keys move between options and select as they go, which is the
  // behaviour assistive technology expects from a radiogroup.
  const onKeyDown = (event: React.KeyboardEvent) => {
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const backward = event.key === "ArrowLeft" || event.key === "ArrowUp";
    if (!forward && !backward) return;
    event.preventDefault();
    const from = selectedIndex >= 0 ? selectedIndex : 0;
    const next = forward
      ? (from + 1) % options.length
      : (from - 1 + options.length) % options.length;
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    buttonRefs.current[next]?.focus();
  };

  return (
    <div
      className={`segmented-control${columns ? ` segmented-columns-${columns}` : ""}`}
      role="radiogroup"
      aria-label={legend}
    >
      {name ? <input type="hidden" name={name} value={value} /> : null}
      {!hiddenLegend ? (
        <span className="segmented-legend" id={`${groupId}-legend`}>
          {legend}
        </span>
      ) : null}
      <div className="segmented-options">
        {options.map((option, index) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              ref={(node) => {
                buttonRefs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected || (selectedIndex === -1 && index === 0) ? 0 : -1}
              disabled={disabled}
              className={`segmented-option tone-${option.tone ?? "neutral"}${
                selected ? " is-selected" : ""
              }`}
              onKeyDown={onKeyDown}
              onClick={() => onChange(option.value)}
            >
              <span className="segmented-option-label">{option.label}</span>
              {option.hint ? <span className="segmented-option-hint">{option.hint}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
