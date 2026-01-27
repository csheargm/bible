import React, { useState } from 'react';

interface VerseIndicatorsProps {
  hasNote: boolean;
  hasResearch: boolean;
  notePreview?: string;
  researchCount?: number;
  onClick?: () => void;
}

const VerseIndicators: React.FC<VerseIndicatorsProps> = ({
  hasNote,
  hasResearch,
  notePreview = '',
  researchCount = 0,
  onClick
}) => {
  const [showPreview, setShowPreview] = useState(false);
  const hideTimeoutRef = React.useRef<number | null>(null);

  if (!hasNote && !hasResearch) return null;

  const handleMouseEnter = () => {
    // Clear any pending hide timeout
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    
    if (notePreview) {
      setShowPreview(true);
    }
  };

  const handleMouseLeave = () => {
    // Add a delay before hiding to allow time to move to the popup
    hideTimeoutRef.current = window.setTimeout(() => {
      setShowPreview(false);
    }, 300);
  };

  const cleanNoteText = (text: string): string => {
    // First, parse as potential JSON to extract text field
    try {
      const parsed = JSON.parse(text);
      if (parsed.text) {
        text = parsed.text;
      }
    } catch {
      // Not JSON, continue with original text
    }
    
    // Remove HTML tags
    text = text.replace(/<[^>]*>/g, '');
    
    // Remove metadata patterns like timestamps
    text = text.replace(/\[\d{4}年\d{1,2}月\d{1,2}日.*?\]/g, '');
    text = text.replace(/\[\d{4}-\d{2}-\d{2}.*?\]/g, '');
    
    // Remove drawing data that might appear
    text = text.replace(/"drawing":\s*"[^"]*"/g, '');
    
    // Clean up any JSON-like formatting
    text = text.replace(/[\{\}"]/g, '');
    
    // Trim and clean up whitespace
    text = text.trim().replace(/\s+/g, ' ');
    
    return text;
  };

  const truncatePreview = (text: string, maxLength: number = 150) => {
    const cleanText = cleanNoteText(text);
    if (cleanText.length <= maxLength) return cleanText;
    return cleanText.substring(0, maxLength) + '...';
  };

  return (
    <span 
      className="verse-indicators"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {hasNote && <span className="indicator note-indicator" title="Personal note">📝</span>}
      {hasResearch && (
        <span className="indicator research-indicator" title={`AI research (${researchCount})`}>
          🤖
          {researchCount > 1 && <span className="count">{researchCount}</span>}
        </span>
      )}

      {showPreview && notePreview && (
        <div 
          className="note-preview-tooltip"
          onMouseEnter={() => {
            // Clear hide timeout when hovering over the tooltip
            if (hideTimeoutRef.current) {
              clearTimeout(hideTimeoutRef.current);
              hideTimeoutRef.current = null;
            }
          }}
          onMouseLeave={handleMouseLeave}
          onClick={onClick}
        >
          <div className="preview-content">
            {truncatePreview(notePreview)}
          </div>
          <div className="preview-footer">
            Click to view full note
          </div>
        </div>
      )}

      <style>{`
        .verse-indicators {
          display: inline-flex;
          gap: 2px;
          margin-left: 4px;
          position: relative;
          cursor: pointer;
        }

        .indicator {
          display: inline-flex;
          align-items: center;
          font-size: 12px;
          opacity: 0.7;
          transition: opacity 0.2s;
          position: relative;
        }

        .verse-indicators:hover .indicator {
          opacity: 1;
        }

        .research-indicator {
          position: relative;
        }

        .count {
          position: absolute;
          top: -4px;
          right: -4px;
          background: #4f46e5;
          color: white;
          font-size: 9px;
          padding: 1px 3px;
          border-radius: 8px;
          min-width: 12px;
          text-align: center;
          font-weight: bold;
        }

        .note-preview-tooltip {
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%) translateY(-8px);
          background: rgba(0, 0, 0, 0.95);
          color: white;
          padding: 10px 12px;
          border-radius: 6px;
          max-width: 300px;
          min-width: 200px;
          z-index: 1000;
          pointer-events: auto;
          cursor: pointer;
          animation: fadeIn 0.2s ease-out;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          transition: background 0.2s;
        }
        
        .note-preview-tooltip:hover {
          background: rgba(0, 0, 0, 1);
        }

        .note-preview-tooltip::after {
          content: '';
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-top: 6px solid rgba(0, 0, 0, 0.9);
        }

        .preview-content {
          font-size: 12px;
          line-height: 1.5;
          margin-bottom: 6px;
        }

        .preview-footer {
          font-size: 10px;
          opacity: 0.7;
          font-style: italic;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(-8px);
          }
        }

        @media (max-width: 600px) {
          .note-preview-tooltip {
            max-width: 250px;
          }
        }
      `}</style>
    </span>
  );
};

export default VerseIndicators;