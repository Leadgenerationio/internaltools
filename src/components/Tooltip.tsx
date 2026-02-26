'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface TooltipProps {
  text: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export default function Tooltip({ text, position = 'top' }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const popupRef = useRef<HTMLSpanElement>(null);

  // Close on outside tap (mobile support)
  useEffect(() => {
    if (!visible) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setVisible(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [visible]);

  // Reposition if overflowing viewport
  useEffect(() => {
    if (!visible || !popupRef.current) return;
    const el = popupRef.current;
    const rect = el.getBoundingClientRect();
    if (rect.left < 8) {
      el.style.transform = `translateX(${8 - rect.left}px)`;
    } else if (rect.right > window.innerWidth - 8) {
      el.style.transform = `translateX(${window.innerWidth - 8 - rect.right}px)`;
    }
  }, [visible]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const show = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(true);
  }, []);

  const hide = useCallback(() => {
    timeoutRef.current = setTimeout(() => setVisible(false), 150);
  }, []);

  const toggle = useCallback(() => {
    setVisible((v) => !v);
  }, []);

  const positionClasses: Record<string, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  const arrowClasses: Record<string, string> = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-gray-800 border-l-transparent border-r-transparent border-b-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-gray-800 border-l-transparent border-r-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-gray-800 border-t-transparent border-b-transparent border-r-transparent',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-gray-800 border-t-transparent border-b-transparent border-l-transparent',
  };

  return (
    <span
      ref={tooltipRef}
      className="relative inline-flex items-center ml-1.5"
      onMouseEnter={show}
      onMouseLeave={hide}
      onClick={toggle}
    >
      <svg
        className={`w-4 h-4 cursor-help transition-colors ${
          visible ? 'text-blue-400' : 'text-gray-500 hover:text-blue-400'
        }`}
        fill="none"
        viewBox="0 0 20 20"
        aria-label="More info"
      >
        <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
        <text
          x="10"
          y="14.5"
          textAnchor="middle"
          fill="currentColor"
          fontSize="11"
          fontWeight="600"
          fontFamily="system-ui, sans-serif"
        >
          i
        </text>
      </svg>

      {visible && (
        <span
          ref={popupRef}
          className={`absolute z-50 ${positionClasses[position]} pointer-events-none`}
          role="tooltip"
        >
          <span className="block w-72 bg-gray-800 border border-gray-600 text-gray-200 text-[13px] leading-relaxed rounded-lg shadow-xl px-3.5 py-2.5 whitespace-normal animate-tooltip-fade">
            {text}
          </span>
          <span
            className={`absolute w-0 h-0 border-[5px] ${arrowClasses[position]}`}
          />
        </span>
      )}
    </span>
  );
}
