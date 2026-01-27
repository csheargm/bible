import React, { useEffect, useRef } from 'react';

interface ContextMenuProps {
  position: { x: number; y: number };
  selectedText: string;
  onResearch: () => void;
  onAddNote: () => void;
  onCopy: () => void;
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  position,
  selectedText,
  onResearch,
  onAddNote,
  onCopy,
  onClose
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleScroll = () => {
      onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  // Adjust position to keep menu on screen
  const adjustedPosition = { ...position };
  
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight
      };

      // Adjust horizontal position
      if (rect.right > viewport.width - 10) {
        adjustedPosition.x = position.x - (rect.right - viewport.width + 10);
      }

      // Adjust vertical position
      if (rect.bottom > viewport.height - 10) {
        adjustedPosition.y = position.y - (rect.bottom - viewport.height + 10);
      }

      menuRef.current.style.left = `${adjustedPosition.x}px`;
      menuRef.current.style.top = `${adjustedPosition.y}px`;
    }
  }, [position]);

  const handleAction = (action: () => void) => {
    // Clear any text selection first
    window.getSelection()?.removeAllRanges();
    action();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 9999
      }}
    >
      <div className="menu-item" onClick={() => handleAction(onResearch)}>
        <span className="menu-icon">🔍</span>
        <span className="menu-label">Research with AI</span>
      </div>
      
      <div className="menu-item" onClick={() => handleAction(onAddNote)}>
        <span className="menu-icon">✏️</span>
        <span className="menu-label">Add to Notes</span>
      </div>
      
      <div className="menu-divider" />
      
      <div className="menu-item" onClick={() => handleAction(onCopy)}>
        <span className="menu-icon">📋</span>
        <span className="menu-label">Copy Text</span>
      </div>

      {selectedText.length > 50 && (
        <>
          <div className="menu-divider" />
          <div className="selected-text-preview">
            "{selectedText.substring(0, 50)}..."
          </div>
        </>
      )}

      <style>{`
        .context-menu {
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
          border: 1px solid #e0e0e0;
          padding: 4px 0;
          min-width: 180px;
          animation: fadeIn 0.1s ease-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .menu-item {
          display: flex;
          align-items: center;
          padding: 8px 12px;
          cursor: pointer;
          transition: background 0.2s;
          font-size: 14px;
        }

        .menu-item:hover {
          background: #f0f0f0;
        }

        .menu-icon {
          margin-right: 10px;
          font-size: 16px;
        }

        .menu-label {
          flex: 1;
          color: #333;
        }

        .menu-divider {
          height: 1px;
          background: #e0e0e0;
          margin: 4px 0;
        }

        .selected-text-preview {
          padding: 8px 12px;
          font-size: 12px;
          color: #666;
          font-style: italic;
          border-top: 1px solid #e0e0e0;
        }

        @media (max-width: 600px) {
          .context-menu {
            min-width: 160px;
          }

          .menu-item {
            padding: 10px 12px;
          }
        }
      `}</style>
    </div>
  );
};

export default ContextMenu;