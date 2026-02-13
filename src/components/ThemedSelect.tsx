import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type ThemedSelectOption = {
  value: string;
  label: string;
};

type ThemedSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: ThemedSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  buttonClassName?: string;
  getOptionDotClassName?: (value: string) => string | undefined;
};

export const ThemedSelect: React.FC<ThemedSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled = false,
  buttonClassName,
  getOptionDotClassName,
}) => {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ left: number; top: number; width: number; direction: 'down' | 'up' } | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(() => {
    const idx = options.findIndex(o => o.value === value);
    return idx >= 0 ? idx : 0;
  });

  const selectedLabel = useMemo(() => {
    const match = options.find(o => o.value === value);
    return match?.label ?? '';
  }, [options, value]);

  const selectedDotClassName = useMemo(() => {
    if (!getOptionDotClassName) return undefined;
    if (!value) return undefined;
    const match = options.find(o => o.value === value);
    if (!match) return undefined;
    return getOptionDotClassName(match.value);
  }, [getOptionDotClassName, options, value]);

  useEffect(() => {
    const idx = options.findIndex(o => o.value === value);
    if (idx >= 0) setHighlightedIndex(idx);
  }, [options, value]);

  useEffect(() => {
    if (!isOpen) return;

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const updateDropdownPosition = () => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const gap = 8;
    const estimatedMaxHeight = 256;
    const spaceBelow = window.innerHeight - rect.bottom;
    const direction = spaceBelow < estimatedMaxHeight + gap ? 'up' : 'down';
    setDropdownPos({
      left: rect.left,
      top: direction === 'down' ? rect.bottom + gap : rect.top - gap,
      width: rect.width,
      direction,
    });
  };

  const openWithIndex = (nextIndex: number) => {
    if (disabled) return;
    setIsOpen(true);
    setHighlightedIndex(Math.max(0, Math.min(options.length - 1, nextIndex)));
  };

  useEffect(() => {
    if (!isOpen) return;
    updateDropdownPosition();

    const onResize = () => updateDropdownPosition();
    const onScroll = () => updateDropdownPosition();

    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [isOpen]);

  const commitIndex = (idx: number) => {
    const option = options[idx];
    if (!option) return;
    onChange(option.value);
    setIsOpen(false);
  };

  const handleButtonKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openWithIndex(highlightedIndex);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        openWithIndex(Math.max(0, highlightedIndex - 1));
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(i => Math.min(options.length - 1, i + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(i => Math.max(0, i - 1));
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      setHighlightedIndex(0);
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      setHighlightedIndex(Math.max(0, options.length - 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      commitIndex(highlightedIndex);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  const baseButton =
    "h-12 w-full bg-white border border-slate-200 rounded-xl px-4 pr-10 text-[14px] text-slate-900 text-left outline-none transition-colors focus:ring-4 focus:ring-[#407B7E]/20 focus:border-[#407B7E] disabled:opacity-60 disabled:cursor-not-allowed";

  const dropdownNode =
    isOpen && options.length > 0 && dropdownPos
      ? createPortal(
          <div
            ref={dropdownRef}
            id={listboxId}
            role="listbox"
            style={{
              position: 'fixed',
              left: dropdownPos.left,
              width: dropdownPos.width,
              top: dropdownPos.direction === 'down' ? dropdownPos.top : undefined,
              bottom: dropdownPos.direction === 'up' ? window.innerHeight - dropdownPos.top : undefined,
              zIndex: 50,
            }}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-200/60"
          >
            <div className="max-h-64 overflow-auto py-1">
              {options.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isHighlighted = idx === highlightedIndex;

                const optionClassName = isSelected
                  ? 'bg-[#073D44] text-white'
                  : isHighlighted
                    ? 'bg-[#407B7E]/10 text-slate-900'
                    : 'text-slate-700 hover:bg-slate-50';

                return (
                  <button
                    key={`${opt.value}-${idx}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => commitIndex(idx)}
                    className={`w-full px-4 py-2.5 text-left text-[14px] transition-colors ${optionClassName}`}
                  >
                    <span className="flex items-center gap-2">
                      {getOptionDotClassName?.(opt.value) ? (
                        <span className={`h-2.5 w-2.5 rounded-full ${getOptionDotClassName(opt.value)}`} />
                      ) : null}
                      <span className="block truncate">{opt.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        onClick={() => (isOpen ? setIsOpen(false) : openWithIndex(highlightedIndex))}
        onKeyDown={handleButtonKeyDown}
        className={buttonClassName ? `${baseButton} ${buttonClassName}` : baseButton}
      >
        <span className={selectedLabel ? 'flex items-center gap-2' : 'flex items-center gap-2 text-slate-400'}>
          {selectedDotClassName ? <span className={`h-2.5 w-2.5 rounded-full ${selectedDotClassName}`} /> : null}
          <span className="block truncate">{selectedLabel || placeholder}</span>
        </span>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {dropdownNode}
    </div>
  );
};
