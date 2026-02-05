/**
 * InlineBibleAnnotation.tsx
 *
 * Overlay annotation system for writing directly on Bible verses.
 * Think: writing in the margins of a physical Bible, but with infinite digital space.
 *
 * Features:
 * - Transparent drawing canvas overlaid on verse text
 * - Floating mini-toolbar for pen/highlighter/eraser/color/undo
 * - Expandable writing space below verses (drag handle)
 * - Saves per book+chapter to IndexedDB
 * - Faint overlay of saved annotations when not in edit mode
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import DrawingCanvas, { DrawingCanvasHandle, SerializedPath } from './DrawingCanvas';
import { annotationStorage } from '../services/annotationStorage';

interface InlineBibleAnnotationProps {
  bookId: string;
  chapter: number;
  /** Whether annotation/drawing mode is active */
  isActive: boolean;
  /** The natural height of the verse content area (pixels) */
  contentHeight: number;
  /** Theme accent color for UI elements */
  accentColor?: string;
}

// ─── Preset colors for the color picker ─────────────────────────────────────
const COLOR_PRESETS = [
  '#000000', // Black
  '#1a1a2e', // Dark navy
  '#e74c3c', // Red
  '#e67e22', // Orange
  '#2ecc71', // Green
  '#3498db', // Blue
  '#9b59b6', // Purple
  '#8B7355', // Brown (matches Bible theme)
];

const MAX_EXPAND = 2000; // Maximum additional expandable height in px

const InlineBibleAnnotation: React.FC<InlineBibleAnnotationProps> = ({
  bookId,
  chapter,
  isActive,
  contentHeight,
  accentColor = '#6366f1',
}) => {
  const canvasRef = useRef<DrawingCanvasHandle>(null);

  // ── State ──────────────────────────────────────────────────────────────
  const [currentTool, setCurrentTool] = useState<'pen' | 'marker' | 'highlighter' | 'eraser'>('pen');
  const [currentColor, setCurrentColor] = useState('#000000');
  const [currentSize, setCurrentSize] = useState(2);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [extraHeight, setExtraHeight] = useState(0);       // Extra expanded space
  const [savedPaths, setSavedPaths] = useState<string>(''); // Serialized path data for read-only view
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ y: number; height: number }>({ y: 0, height: 0 });

  // Track the book+chapter key for loading/saving
  const annotationKey = `${bookId}:${chapter}`;
  const prevKeyRef = useRef(annotationKey);

  // Total canvas height = verse content + expanded space
  const totalHeight = contentHeight + extraHeight;

  // ── Load saved annotation when book/chapter changes ───────────────────

  useEffect(() => {
    const loadAnnotation = async () => {
      const result = await annotationStorage.getAnnotation(bookId, chapter);
      if (result) {
        setSavedPaths(result.data);
        setExtraHeight(result.height);
        // If canvas is mounted and active, load the paths
        if (canvasRef.current && result.data) {
          try {
            const paths = JSON.parse(result.data) as SerializedPath[];
            canvasRef.current.loadPaths(paths);
          } catch {
            // Invalid data, ignore
          }
        }
      } else {
        setSavedPaths('');
        setExtraHeight(0);
        if (canvasRef.current) {
          canvasRef.current.clear();
        }
      }
    };

    // Save current annotation before switching chapters
    if (prevKeyRef.current !== annotationKey && savedPaths) {
      const [prevBook, prevChapter] = prevKeyRef.current.split(':');
      annotationStorage.saveAnnotation(prevBook, parseInt(prevChapter), savedPaths, extraHeight);
    }
    prevKeyRef.current = annotationKey;

    loadAnnotation();
  }, [bookId, chapter]);

  // When activating annotation mode, load paths into the canvas
  useEffect(() => {
    if (isActive && canvasRef.current && savedPaths) {
      try {
        const paths = JSON.parse(savedPaths) as SerializedPath[];
        // Small delay to let canvas mount and size properly
        requestAnimationFrame(() => {
          canvasRef.current?.loadPaths(paths);
        });
      } catch {
        // Invalid data
      }
    }
  }, [isActive]);

  // ── Auto-save on tool change or deactivation ─────────────────────────

  const handleCanvasChange = useCallback((data: string) => {
    setSavedPaths(data);
    // Save to IndexedDB
    annotationStorage.saveAnnotation(bookId, chapter, data, extraHeight);
  }, [bookId, chapter, extraHeight]);

  // Save when extra height changes
  useEffect(() => {
    if (savedPaths) {
      annotationStorage.saveAnnotation(bookId, chapter, savedPaths, extraHeight);
    }
  }, [extraHeight]);

  // ── Tool switching ────────────────────────────────────────────────────

  const selectTool = useCallback((tool: 'pen' | 'marker' | 'highlighter' | 'eraser') => {
    setCurrentTool(tool);
    canvasRef.current?.setTool(tool);
    // Set appropriate default size for each tool
    let size = 2;
    switch (tool) {
      case 'pen': size = 2; break;
      case 'marker': size = 3; break;
      case 'highlighter': size = 4; break;
      case 'eraser': size = 8; break;
    }
    setCurrentSize(size);
    canvasRef.current?.setSize(size);
  }, []);

  const selectColor = useCallback((color: string) => {
    setCurrentColor(color);
    canvasRef.current?.setColor(color);
    setShowColorPicker(false);
  }, []);

  const handleUndo = useCallback(() => {
    canvasRef.current?.undo();
  }, []);

  const handleClearAll = useCallback(() => {
    if (confirm('清除此章所有标注？\nClear all annotations for this chapter?')) {
      canvasRef.current?.clear();
      setSavedPaths('');
      setExtraHeight(0);
      annotationStorage.deleteAnnotation(bookId, chapter);
    }
  }, [bookId, chapter]);

  // ── Expand handle drag ────────────────────────────────────────────────

  const handleExpandPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartRef.current = { y: e.clientY, height: extraHeight };

    const handleMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientY - dragStartRef.current.y;
      const newHeight = Math.max(0, Math.min(MAX_EXPAND, dragStartRef.current.height + delta));
      setExtraHeight(newHeight);
    };

    const handleUp = () => {
      setIsDragging(false);
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
  }, [extraHeight]);

  // ── Render ────────────────────────────────────────────────────────────

  // If not active, render a faint read-only overlay of saved annotations
  if (!isActive) {
    if (!savedPaths || savedPaths === '[]' || savedPaths === '') return null;

    return (
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          height: `${contentHeight}px`,
          overflow: 'hidden',
          opacity: 0.35, // Faint overlay so users can see their notes
        }}
      >
        <DrawingCanvas
          ref={canvasRef}
          initialData={savedPaths}
          onChange={() => {}} // Read-only
          overlayMode={true}
          isWritingMode={false}
          canvasHeight={totalHeight}
        />
      </div>
    );
  }

  // Active annotation mode
  return (
    <>
      {/* Drawing canvas overlay — blocks all text interaction when active */}
      <div
        className="absolute inset-0 z-20"
        style={{
          height: `${totalHeight}px`,
          // Don't block text visibility
          mixBlendMode: 'multiply',
          // Prevent text selection on underlying content
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          // Capture all pointer events to prevent text selection bubbling
          pointerEvents: 'auto',
        }}
        // Prevent context menu on the overlay container
        onContextMenu={(e) => e.preventDefault()}
        // Prevent any selection start events
        onSelectCapture={(e) => e.preventDefault()}
      >
        <DrawingCanvas
          ref={canvasRef}
          initialData={savedPaths}
          onChange={handleCanvasChange}
          overlayMode={true}
          isWritingMode={true}
          canvasHeight={totalHeight}
        />
      </div>

      {/* Margin line: shows where original content ends and expanded space begins */}
      {extraHeight > 0 && (
        <div
          className="absolute left-4 right-4 z-30 pointer-events-none"
          style={{
            top: `${contentHeight}px`,
            borderTop: '1px dashed rgba(139, 115, 85, 0.3)',
          }}
        >
          <span
            className="absolute -top-3 right-0 text-[9px] tracking-wider uppercase"
            style={{ color: 'rgba(139, 115, 85, 0.4)' }}
          >
            margin · 留白
          </span>
        </div>
      )}

      {/* Expand handle */}
      <div
        className="absolute left-0 right-0 z-30 flex items-center justify-center cursor-ns-resize group"
        style={{
          top: `${totalHeight - 2}px`,
          height: '24px',
          touchAction: 'none',
        }}
        onPointerDown={handleExpandPointerDown}
      >
        <div
          className="flex items-center gap-1 px-4 py-1 rounded-full transition-all"
          style={{
            backgroundColor: isDragging ? 'rgba(99, 102, 241, 0.15)' : 'rgba(139, 115, 85, 0.08)',
            border: `1px solid ${isDragging ? 'rgba(99, 102, 241, 0.3)' : 'rgba(139, 115, 85, 0.15)'}`,
          }}
        >
          <span className="text-[10px] font-medium" style={{ color: 'rgba(139, 115, 85, 0.5)' }}>
            ↕ {extraHeight > 0 ? `+${extraHeight}px` : '展开'}
          </span>
        </div>
      </div>

      {/* Floating mini-toolbar */}
      <div
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 px-3 py-2 rounded-2xl shadow-2xl border"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderColor: 'rgba(0, 0, 0, 0.08)',
        }}
      >
        {/* Tool buttons */}
        {([
          { tool: 'pen' as const, icon: '✒️', label: 'Pen' },
          { tool: 'highlighter' as const, icon: '🖍️', label: 'Highlight' },
          { tool: 'marker' as const, icon: '🖊️', label: 'Marker' },
          { tool: 'eraser' as const, icon: '🧹', label: 'Eraser' },
        ]).map(({ tool, icon, label }) => (
          <button
            key={tool}
            onClick={() => selectTool(tool)}
            className={`flex items-center justify-center w-9 h-9 rounded-xl transition-all ${
              currentTool === tool
                ? 'shadow-md scale-110'
                : 'hover:bg-slate-100 opacity-70'
            }`}
            style={{
              backgroundColor: currentTool === tool ? `${accentColor}20` : undefined,
              border: currentTool === tool ? `2px solid ${accentColor}` : '2px solid transparent',
            }}
            title={label}
          >
            <span className="text-base">{icon}</span>
          </button>
        ))}

        {/* Divider */}
        <div className="w-[1px] h-6 bg-slate-200 mx-1" />

        {/* Color picker */}
        <div className="relative">
          <button
            onClick={() => setShowColorPicker(!showColorPicker)}
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-slate-100 transition-all"
            title="Color"
          >
            <div
              className="w-5 h-5 rounded-full border-2 border-white shadow-sm"
              style={{ backgroundColor: currentColor }}
            />
          </button>
          {showColorPicker && (
            <div
              className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 flex gap-1 p-2 rounded-xl shadow-xl border"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.98)',
                borderColor: 'rgba(0, 0, 0, 0.08)',
              }}
            >
              {COLOR_PRESETS.map((color) => (
                <button
                  key={color}
                  onClick={() => selectColor(color)}
                  className={`w-7 h-7 rounded-full transition-all hover:scale-110 ${
                    currentColor === color ? 'ring-2 ring-offset-1 scale-110 ring-indigo-400' : ''
                  }`}
                  style={{
                    backgroundColor: color,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Size slider */}
        <input
          type="range"
          min={1}
          max={12}
          value={currentSize}
          onChange={(e) => {
            const size = parseInt(e.target.value);
            setCurrentSize(size);
            canvasRef.current?.setSize(size);
          }}
          className="w-16 h-1 accent-slate-500"
          title={`Size: ${currentSize}`}
        />

        {/* Divider */}
        <div className="w-[1px] h-6 bg-slate-200 mx-1" />

        {/* Undo */}
        <button
          onClick={handleUndo}
          className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-slate-100 transition-all"
          title="Undo 撤销"
        >
          <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
          </svg>
        </button>

        {/* Clear all */}
        <button
          onClick={handleClearAll}
          className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all"
          title="Clear all 清除全部"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </>
  );
};

export default InlineBibleAnnotation;
