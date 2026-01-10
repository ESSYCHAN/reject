import { useState, ReactNode } from 'react';
import './Tooltip.css';

interface TooltipProps {
  content: string;
  children: ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <span
      className="tooltip-wrapper"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
      tabIndex={0}
    >
      {children}
      <span className="tooltip-icon">?</span>
      {isVisible && (
        <span className="tooltip-content">
          {content}
        </span>
      )}
    </span>
  );
}
