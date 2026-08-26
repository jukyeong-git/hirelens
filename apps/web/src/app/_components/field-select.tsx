"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export interface FieldSelectOption {
  value: string;
  label: string;
  /** Shown under the label in the open list, never in the closed button. */
  hint?: string;
}

interface FieldSelectProps {
  options: FieldSelectOption[];
  value: string;
  onChange: (value: string) => void;
  /** Rendered as the closed-state text while `value` is empty. */
  placeholder?: string;
  disabled?: boolean;
  /** Emits a hidden input so the control works inside a plain form action. */
  name?: string;
  required?: boolean;
  ariaLabel?: string;
  id?: string;
}

/**
 * A listbox that replaces `<select>`.
 *
 * The native control renders as an OS widget we cannot style, which reads as an
 * unfinished internal tool next to the rest of the product. This keeps the
 * keyboard contract people expect from a select — type-ahead aside — and posts
 * its value through a hidden input so callers can keep using form actions.
 */
export function FieldSelect({
  options,
  value,
  onChange,
  placeholder = "선택하세요",
  disabled = false,
  name,
  required = false,
  ariaLabel,
  id,
}: FieldSelectProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const listId = `${controlId}-listbox`;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);

  const selectedIndex = useMemo(
    () => options.findIndex((option) => option.value === value),
    [options, value],
  );
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  // Closing on outside interaction has to be a document listener: the click may
  // land on an unrelated element that never bubbles through this subtree.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const openList = (index: number) => {
    if (disabled) return;
    setActiveIndex(Math.max(0, Math.min(index, options.length - 1)));
    setOpen(true);
  };

  const commit = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) openList(selectedIndex >= 0 ? selectedIndex : 0);
        else setActiveIndex((current) => Math.min(current + 1, options.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!open) openList(selectedIndex >= 0 ? selectedIndex : 0);
        else setActiveIndex((current) => Math.max(current - 1, 0));
        break;
      case "Home":
        if (open) {
          event.preventDefault();
          setActiveIndex(0);
        }
        break;
      case "End":
        if (open) {
          event.preventDefault();
          setActiveIndex(options.length - 1);
        }
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (open) commit(activeIndex);
        else openList(selectedIndex >= 0 ? selectedIndex : 0);
        break;
      case "Escape":
        if (open) {
          event.preventDefault();
          setOpen(false);
        }
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
  };

  return (
    <div className={`field-select${open ? " field-select-open" : ""}`} ref={rootRef}>
      {name ? <input type="hidden" name={name} value={value} required={required} /> : null}
      <button
        type="button"
        id={controlId}
        ref={buttonRef}
        className="field-select-control"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
        onClick={() => (open ? setOpen(false) : openList(selectedIndex >= 0 ? selectedIndex : 0))}
      >
        <span className={selected ? "field-select-value" : "field-select-placeholder"}>
          {selected?.label ?? placeholder}
        </span>
        <svg aria-hidden="true" viewBox="0 0 12 8" className="field-select-caret">
          <path d="M1 1.5 6 6.5 11 1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      </button>
      {open ? (
        <ul
          className="field-select-list"
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={`${controlId}-option-${activeIndex}`}
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${controlId}-option-${index}`}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              role="option"
              aria-selected={option.value === value}
              className={`field-select-option${index === activeIndex ? " is-active" : ""}${
                option.value === value ? " is-selected" : ""
              }`}
              onPointerEnter={() => setActiveIndex(index)}
              onClick={() => commit(index)}
            >
              <span className="field-select-option-label">{option.label}</span>
              {option.hint ? <span className="field-select-option-hint">{option.hint}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
