/**
 * DrawingCanvas.tsx — High-performance drawing canvas for iPad + Apple Pencil
 *
 * Key design decisions for native-like feel:
 * - All drawing state lives in refs, NOT React state → zero re-renders while pen is moving
 * - getCoalescedEvents() captures every Apple Pencil sample (~240Hz) for butter-smooth strokes
 * - requestAnimationFrame batches rendering for consistent frame timing
 * - Pressure + tilt sensitivity for natural calligraphy effects
 * - Only serializes/saves on pointerUp (stroke complete)
 * - Apple Pencil double-tap toggles eraser
 */

import React, { useRef, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DrawingCanvasProps {
  initialData?: string;            // JSON-serialized path data OR base64 image
  onChange: (data: string) => void; // Called when a stroke completes
  overlayMode?: boolean;           // Transparent overlay on text
  isWritingMode?: boolean;         // Allow drawing vs navigation
  canvasHeight?: number;           // Explicit height override (for expandable space)
}

export interface DrawingCanvasHandle {
  clear: () => void;
  getData: () => string;
  undo: () => void;
  setTool: (tool: 'pen' | 'marker' | 'highlighter' | 'eraser') => void;
  setColor: (color: string) => void;
  setSize: (size: number) => void;
  redraw: () => void;
  loadPaths: (paths: SerializedPath[]) => void;
}

/** A single point sampled from the pointer device */
interface Point {
  x: number;
  y: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
}

/** A completed stroke with all its metadata */
export interface SerializedPath {
  tool: 'pen' | 'marker' | 'highlighter' | 'eraser';
  color: string;
  size: number;
  points: Point[];
}

// ─── Component ──────────────────────────────────────────────────────────────

const DrawingCanvas = forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(
  ({ initialData, onChange, overlayMode = false, isWritingMode = true, canvasHeight }, ref) => {

    // ── Canvas refs ─────────────────────────────────────────────────────
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

    // ── Drawing state — ALL in refs for zero-render drawing ─────────────
    const pathsRef = useRef<SerializedPath[]>([]);
    const currentPointsRef = useRef<Point[]>([]);
    const isDrawingRef = useRef(false);
    const toolRef = useRef<'pen' | 'marker' | 'highlighter' | 'eraser'>('pen');
    const colorRef = useRef('#000000');
    const sizeRef = useRef(2);
    const needsRedrawRef = useRef(false);
    const rafIdRef = useRef<number>(0);

    // Apple Pencil double-tap detection
    const lastPenDownRef = useRef(0);

    // DPR for retina canvas
    const dprRef = useRef(window.devicePixelRatio || 1);

    // ── Imperative handle (same interface as before) ────────────────────
    useImperativeHandle(ref, () => ({
      clear: () => {
        pathsRef.current = [];
        currentPointsRef.current = [];
        fullRedraw();
        onChange('');
      },
      getData: () => {
        if (pathsRef.current.length === 0) return '';
        return JSON.stringify(pathsRef.current);
      },
      undo: () => {
        if (pathsRef.current.length > 0) {
          pathsRef.current = pathsRef.current.slice(0, -1);
          fullRedraw();
          onChange(pathsRef.current.length > 0 ? JSON.stringify(pathsRef.current) : '');
        }
      },
      setTool: (tool) => { toolRef.current = tool; },
      setColor: (color) => { colorRef.current = color; },
      setSize: (size) => { sizeRef.current = size; },
      redraw: () => { fullRedraw(); },
      loadPaths: (paths: SerializedPath[]) => {
        pathsRef.current = paths;
        fullRedraw();
      },
    }));

    // ── Canvas sizing ───────────────────────────────────────────────────

    const setupCanvasSize = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      dprRef.current = dpr;

      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = canvasHeight ?? rect.height;

      // Only resize if dimensions changed (avoids clearing content)
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);

        const ctx = canvas.getContext('2d', { willReadFrequently: false });
        if (ctx) {
          ctx.scale(dpr, dpr);
          ctxRef.current = ctx;
        }

        // Redraw all paths after resize
        fullRedraw();
      }
    }, [canvasHeight]);

    useEffect(() => {
      setupCanvasSize();

      const canvas = canvasRef.current;
      if (!canvas) return;

      const observer = new ResizeObserver(() => setupCanvasSize());
      observer.observe(canvas);

      return () => observer.disconnect();
    }, [setupCanvasSize]);

    // Re-setup when canvasHeight prop changes
    useEffect(() => {
      setupCanvasSize();
    }, [canvasHeight, setupCanvasSize]);

    // ── Load initial data ───────────────────────────────────────────────

    useEffect(() => {
      if (!initialData || initialData.length === 0) return;

      // Try JSON path data first
      try {
        const parsed = JSON.parse(initialData);
        if (Array.isArray(parsed)) {
          pathsRef.current = parsed as SerializedPath[];
          fullRedraw();
          return;
        }
      } catch {
        // Not JSON — try as base64 image (backward compat)
      }

      // Fallback: base64 image
      if (initialData.startsWith('data:image')) {
        const img = new Image();
        img.onload = () => {
          const ctx = ctxRef.current;
          const canvas = canvasRef.current;
          if (!ctx || !canvas) return;
          const rect = canvas.getBoundingClientRect();
          ctx.drawImage(img, 0, 0, rect.width, rect.height);
        };
        img.src = initialData;
      }
    }, [initialData]);

    // ── Drawing helpers ─────────────────────────────────────────────────

    /**
     * Draw a single segment between two points, applying tool-specific styles.
     * This is the hot path — called for every point pair during live drawing.
     */
    const drawSegment = useCallback((
      ctx: CanvasRenderingContext2D,
      from: Point,
      to: Point,
      tool: string,
      color: string,
      size: number
    ) => {
      ctx.save();

      // Pressure-sensitive width — optimized for Apple Pencil
      // Lower floor (0.15) means light touches still register
      // Higher multiplier (1.7) gives more dynamic range
      let lineWidth = size;
      const p = to.pressure > 0 ? to.pressure : 0.5;
      lineWidth = size * (0.15 + p * 1.7);

      // Tilt → calligraphy effect (pen only)
      if (tool === 'pen' && (Math.abs(to.tiltX) > 15 || Math.abs(to.tiltY) > 15)) {
        const tiltFactor = 1 + (Math.abs(to.tiltX) + Math.abs(to.tiltY)) / 180;
        lineWidth *= tiltFactor;
      }

      switch (tool) {
        case 'eraser':
          ctx.globalCompositeOperation = 'destination-out';
          ctx.lineWidth = size * 4;
          ctx.strokeStyle = 'rgba(0,0,0,1)';
          break;
        case 'highlighter':
          ctx.globalCompositeOperation = 'multiply';
          ctx.globalAlpha = 0.25;
          ctx.lineWidth = size * 5;
          ctx.strokeStyle = color;
          break;
        case 'marker':
          ctx.globalAlpha = 0.7;
          ctx.lineWidth = lineWidth * 2.5;
          ctx.strokeStyle = color;
          break;
        default: // pen
          ctx.lineWidth = lineWidth;
          ctx.strokeStyle = color;
          break;
      }

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);

      // Quadratic curve through midpoint for smoother strokes
      const mx = (from.x + to.x) / 2;
      const my = (from.y + to.y) / 2;
      ctx.quadraticCurveTo(from.x, from.y, mx, my);

      ctx.stroke();
      ctx.restore();
    }, []);

    /**
     * Redraw ALL completed paths from scratch.
     * Called after undo, clear, resize, or loading data.
     */
    const fullRedraw = useCallback(() => {
      const ctx = ctxRef.current;
      const canvas = canvasRef.current;
      if (!ctx || !canvas) return;

      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, canvasHeight ?? rect.height);

      for (const path of pathsRef.current) {
        if (path.points.length < 2) continue;
        for (let i = 1; i < path.points.length; i++) {
          drawSegment(ctx, path.points[i - 1], path.points[i], path.tool, path.color, path.size);
        }
      }
    }, [drawSegment, canvasHeight]);

    // ── rAF render loop ─────────────────────────────────────────────────
    // Only runs while actively drawing; renders new points incrementally.

    const renderLoop = useCallback(() => {
      if (!needsRedrawRef.current) {
        if (isDrawingRef.current) {
          rafIdRef.current = requestAnimationFrame(renderLoop);
        }
        return;
      }
      needsRedrawRef.current = false;

      const ctx = ctxRef.current;
      if (!ctx) return;

      const pts = currentPointsRef.current;
      if (pts.length < 2) {
        if (isDrawingRef.current) {
          rafIdRef.current = requestAnimationFrame(renderLoop);
        }
        return;
      }

      // Draw only the newest segments (incremental rendering)
      // We draw the last two points each frame
      const from = pts[pts.length - 2];
      const to = pts[pts.length - 1];
      drawSegment(ctx, from, to, toolRef.current, colorRef.current, sizeRef.current);

      if (isDrawingRef.current) {
        rafIdRef.current = requestAnimationFrame(renderLoop);
      }
    }, [drawSegment]);

    // ── Pointer event handlers ──────────────────────────────────────────

    const getPoint = useCallback((e: PointerEvent): Point => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        pressure: e.pressure || 0.5,
        tiltX: e.tiltX || 0,
        tiltY: e.tiltY || 0,
      };
    }, []);

    const handlePointerDown = useCallback((e: PointerEvent) => {
      if (!isWritingMode) return;
      
      // Allow pen input regardless of isPrimary (Apple Pencil is primary, but be safe)
      // For touch/mouse, only allow primary to avoid multi-touch conflicts
      if (e.pointerType !== 'pen' && !e.isPrimary) return;

      // Apple Pencil double-tap detection (pen only)
      if (e.pointerType === 'pen') {
        const now = Date.now();
        if (now - lastPenDownRef.current < 300 && now - lastPenDownRef.current > 50) {
          // Double-tap → toggle eraser
          toolRef.current = toolRef.current === 'eraser' ? 'pen' : 'eraser';
          lastPenDownRef.current = 0;
          return;
        }
        lastPenDownRef.current = now;
      }

      e.preventDefault();
      e.stopPropagation();
      isDrawingRef.current = true;
      currentPointsRef.current = [getPoint(e)];
      needsRedrawRef.current = false;

      // Start render loop
      rafIdRef.current = requestAnimationFrame(renderLoop);
    }, [isWritingMode, getPoint, renderLoop]);

    const handlePointerMove = useCallback((e: PointerEvent) => {
      if (!isDrawingRef.current) return;
      // Don't check isPrimary for move events — we're already drawing
      e.preventDefault();
      e.stopPropagation();

      // getCoalescedEvents() gives us ALL intermediate samples from Apple Pencil
      // (up to 240Hz) instead of just the events that align with display refresh
      // This is critical for smooth handwriting — without it, fast strokes lose points
      const coalescedEvents = (e as any).getCoalescedEvents?.();
      const events = coalescedEvents && coalescedEvents.length > 0 ? coalescedEvents : [e];

      for (const coalescedEvent of events) {
        const point = getPoint(coalescedEvent);
        currentPointsRef.current.push(point);
      }

      needsRedrawRef.current = true;
    }, [getPoint]);

    const handlePointerUp = useCallback((e: PointerEvent) => {
      if (!isDrawingRef.current) return;
      e.preventDefault();
      e.stopPropagation();

      isDrawingRef.current = false;
      cancelAnimationFrame(rafIdRef.current);

      // Finalize the stroke
      const pts = currentPointsRef.current;
      if (pts.length >= 2) {
        const completedPath: SerializedPath = {
          tool: toolRef.current,
          color: colorRef.current,
          size: sizeRef.current,
          points: [...pts],
        };
        pathsRef.current = [...pathsRef.current, completedPath];

        // Serialize and notify parent — only on stroke complete
        onChange(JSON.stringify(pathsRef.current));
      }

      currentPointsRef.current = [];
    }, [onChange]);

    const handlePointerCancel = useCallback((e: PointerEvent) => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;
      cancelAnimationFrame(rafIdRef.current);
      currentPointsRef.current = [];
      // Don't save cancelled strokes — redraw from completed paths
      fullRedraw();
    }, [fullRedraw]);

    // ── Prevent context menu and text selection in writing mode ──

    const preventDefaultHandler = useCallback((e: Event) => {
      if (isWritingMode) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    }, [isWritingMode]);

    // ── Touch event handlers for iOS — prevent context menu but allow pointer events ──
    // Note: We only preventDefault to stop iOS context menu, but don't stopPropagation
    // so that pointer events still fire for drawing
    
    const handleTouchStart = useCallback((e: TouchEvent) => {
      if (!isWritingMode) return;
      // Only prevent default to stop iOS context menu - let pointer events handle drawing
      e.preventDefault();
    }, [isWritingMode]);

    const handleTouchMove = useCallback((e: TouchEvent) => {
      if (!isWritingMode) return;
      // Prevent default to stop scrolling and iOS behaviors
      e.preventDefault();
    }, [isWritingMode]);

    const handleTouchEnd = useCallback((e: TouchEvent) => {
      if (!isWritingMode) return;
      e.preventDefault();
    }, [isWritingMode]);

    // ── Attach pointer events (native, not React) for best performance ──

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Use native addEventListener with { passive: false } for lowest latency
      canvas.addEventListener('pointerdown', handlePointerDown, { passive: false });
      canvas.addEventListener('pointermove', handlePointerMove, { passive: false });
      canvas.addEventListener('pointerup', handlePointerUp, { passive: false });
      canvas.addEventListener('pointercancel', handlePointerCancel, { passive: false });
      
      // Touch events for iOS — these fire before pointer events and can prevent context menu
      canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
      canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
      canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
      
      // Prevent context menu and text selection when in writing mode
      canvas.addEventListener('contextmenu', preventDefaultHandler, { passive: false, capture: true });
      canvas.addEventListener('selectstart', preventDefaultHandler, { passive: false, capture: true });
      
      // iOS-specific: prevent the callout menu
      canvas.addEventListener('webkitmouseforcedown', preventDefaultHandler, { passive: false });

      return () => {
        canvas.removeEventListener('pointerdown', handlePointerDown);
        canvas.removeEventListener('pointermove', handlePointerMove);
        canvas.removeEventListener('pointerup', handlePointerUp);
        canvas.removeEventListener('pointercancel', handlePointerCancel);
        canvas.removeEventListener('touchstart', handleTouchStart);
        canvas.removeEventListener('touchmove', handleTouchMove);
        canvas.removeEventListener('touchend', handleTouchEnd);
        canvas.removeEventListener('contextmenu', preventDefaultHandler);
        canvas.removeEventListener('selectstart', preventDefaultHandler);
        canvas.removeEventListener('webkitmouseforcedown', preventDefaultHandler);
        cancelAnimationFrame(rafIdRef.current);
      };
    }, [handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel, handleTouchStart, handleTouchMove, handleTouchEnd, preventDefaultHandler]);

    // ── Render ──────────────────────────────────────────────────────────

    return (
      <canvas
        ref={canvasRef}
        className={`w-full cursor-crosshair ${
          overlayMode ? 'absolute inset-0 bg-transparent' : 'bg-slate-50/30 rounded-lg'
        }`}
        style={{
          height: canvasHeight ? `${canvasHeight}px` : '100%',
          // Critical: completely disable all touch gestures except our handlers
          touchAction: isWritingMode ? 'none' : 'auto',
          // Prevent iOS text selection callouts and magnifier
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
          // @ts-ignore - Safari-specific property to prevent text editing UI
          WebkitUserModify: 'read-only',
          pointerEvents: 'auto',
          cursor: isWritingMode ? 'crosshair' : 'grab',
          // Prevent iOS tap highlight
          WebkitTapHighlightColor: 'transparent',
          // Prevent text selection highlight
          caretColor: 'transparent',
        }}
        // Prevent long-press context menu on iOS
        onContextMenu={(e) => { if (isWritingMode) { e.preventDefault(); e.stopPropagation(); } }}
        // Additional touch prevention
        onTouchStartCapture={(e) => { if (isWritingMode) e.stopPropagation(); }}
      />
    );
  }
);

DrawingCanvas.displayName = 'DrawingCanvas';
export default DrawingCanvas;
