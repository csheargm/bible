
import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';

interface DrawingCanvasProps {
  initialData?: string; // base64 image or path data
  onChange: (data: string) => void;
  overlayMode?: boolean; // Whether to overlay on text
  isWritingMode?: boolean; // Whether to allow writing or just navigation
}

export interface DrawingCanvasHandle {
  clear: () => void;
  getData: () => string;
  undo: () => void;
  setTool: (tool: 'pen' | 'marker' | 'highlighter' | 'eraser') => void;
  setColor: (color: string) => void;
  setSize: (size: number) => void;
}

interface DrawingPath {
  tool: string;
  color: string;
  size: number;
  path: Array<{
    x: number;
    y: number;
    pressure?: number;
    tiltX?: number;
    tiltY?: number;
  }>;
}

const DrawingCanvas = forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(({ initialData, onChange, overlayMode = false, isWritingMode = true }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentTool, setCurrentTool] = useState<'pen' | 'marker' | 'highlighter' | 'eraser'>('pen');
  const [currentColor, setCurrentColor] = useState('#000000');
  const [currentSize, setCurrentSize] = useState(2);
  const [usePressure, setUsePressure] = useState(true);
  const [paths, setPaths] = useState<DrawingPath[]>([]);
  const [currentPath, setCurrentPath] = useState<DrawingPath['path']>([]);
  const lastTapTime = useRef(0);
  const doubleTapTimeout = useRef<number | null>(null);

  useImperativeHandle(ref, () => ({
    clear: () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      setPaths([]);
      onChange("");
    },
    getData: () => canvasRef.current?.toDataURL() || "",
    undo: () => {
      if (paths.length > 0) {
        const newPaths = paths.slice(0, -1);
        setPaths(newPaths);
        redrawCanvas(newPaths);
      }
    },
    setTool: (tool: 'pen' | 'marker' | 'highlighter' | 'eraser') => {
      setCurrentTool(tool);
    },
    setColor: (color: string) => {
      setCurrentColor(color);
    },
    setSize: (size: number) => {
      setCurrentSize(size);
    }
  }));

  const redrawCanvas = (pathsToRender: DrawingPath[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    pathsToRender.forEach(pathData => {
      if (pathData.path.length < 2) return;
      
      pathData.path.forEach((point, index) => {
        if (index === 0) return;
        const prevPoint = pathData.path[index - 1];
        drawSegment(ctx, prevPoint, point, pathData);
      });
    });
    
    onChange(canvas.toDataURL());
  };

  // Setup canvas size only once or when size changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const setupCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      
      // Only resize if dimensions actually changed
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        // Save current canvas content
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        
        // Restore canvas content
        ctx.putImageData(imageData, 0, 0);
        
        // Redraw all paths
        if (paths.length > 0) {
          redrawCanvas(paths);
        }
      }
    };
    
    setupCanvas();
    
    // Handle resize
    const resizeObserver = new ResizeObserver(setupCanvas);
    resizeObserver.observe(canvas);
    
    return () => resizeObserver.disconnect();
  }, [paths]);
  
  // Load initial data
  useEffect(() => {
    if (initialData && !paths.length) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      const img = new Image();
      img.onload = () => {
        const rect = canvas.getBoundingClientRect();
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
      };
      img.src = initialData;
    }
  }, [initialData, paths.length]);

  const drawSegment = (
    ctx: CanvasRenderingContext2D,
    from: DrawingPath['path'][0],
    to: DrawingPath['path'][0],
    pathData: Pick<DrawingPath, 'tool' | 'color' | 'size'>
  ) => {
    ctx.save();
    
    // Calculate line width based on tool and pressure
    let lineWidth = pathData.size;
    if (usePressure && to.pressure !== undefined) {
      lineWidth = pathData.size * (0.5 + to.pressure * 1.5);
      
      // Add tilt effect for calligraphy
      if (pathData.tool === 'pen' && to.tiltX && to.tiltY && 
          (Math.abs(to.tiltX) > 20 || Math.abs(to.tiltY) > 20)) {
        lineWidth *= (1 + Math.abs(to.tiltX) / 90);
      }
    }
    
    // Configure drawing based on tool
    switch (pathData.tool) {
      case 'eraser':
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = pathData.size * 3;
        break;
      case 'highlighter':
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = pathData.size * 4;
        ctx.strokeStyle = pathData.color;
        break;
      case 'marker':
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = lineWidth * 2;
        ctx.strokeStyle = pathData.color;
        break;
      default: // pen
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = pathData.color;
        break;
    }
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    
    ctx.restore();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Handle Apple Pencil double-tap
    if (e.pointerType === 'pen') {
      const currentTime = Date.now();
      if (currentTime - lastTapTime.current < 300 && currentTime - lastTapTime.current > 50) {
        handleDoubleTap();
        lastTapTime.current = 0;
        return;
      }
      lastTapTime.current = currentTime;
    }
    
    startDrawing(e);
  };

  const handleDoubleTap = () => {
    // Toggle between pen and eraser
    setCurrentTool(currentTool === 'eraser' ? 'pen' : 'eraser');
    
    if (doubleTapTimeout.current) clearTimeout(doubleTapTimeout.current);
    doubleTapTimeout.current = window.setTimeout(() => {
      // Could show indicator here
    }, 1500);
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    // Only check isPrimary for pointer events
    if ('isPrimary' in e && !e.isPrimary) return;
    
    // If not in writing mode, don't start drawing
    if (!isWritingMode) return;
    
    e.preventDefault();
    setIsDrawing(true);
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    let x, y, pressure = 0.5, tiltX = 0, tiltY = 0;
    
    if ('touches' in e && e.touches.length > 0) {
      x = (e.touches[0].clientX - rect.left) * dpr;
      y = (e.touches[0].clientY - rect.top) * dpr;
      // @ts-ignore - force might exist on Touch
      pressure = e.touches[0].force || 0.5;
    } else if ('clientX' in e) {
      x = (e.clientX - rect.left) * dpr;
      y = (e.clientY - rect.top) * dpr;
      if ('pressure' in e) {
        pressure = e.pressure || 0.5;
        tiltX = e.tiltX || 0;
        tiltY = e.tiltY || 0;
      }
    } else {
      return;
    }
    
    const newPath = [{ x: x / dpr, y: y / dpr, pressure, tiltX, tiltY }];
    setCurrentPath(newPath);
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    
    if (currentPath.length > 0) {
      const newPath: DrawingPath = {
        tool: currentTool,
        color: currentColor,
        size: currentSize,
        path: [...currentPath]
      };
      const newPaths = [...paths, newPath];
      setPaths(newPaths);
      setCurrentPath([]);
      
      // Ensure the drawing is saved
      const canvas = canvasRef.current;
      if (canvas) {
        // Small delay to ensure canvas is updated
        setTimeout(() => {
          onChange(canvas.toDataURL());
        }, 10);
      }
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    if (!isDrawing) return;
    // Only check isPrimary for pointer events
    if ('isPrimary' in e && !e.isPrimary) return;
    
    e.preventDefault();
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    let x, y, pressure = 0.5, tiltX = 0, tiltY = 0;
    
    if ('touches' in e && e.touches.length > 0) {
      x = (e.touches[0].clientX - rect.left) * dpr;
      y = (e.touches[0].clientY - rect.top) * dpr;
      // @ts-ignore - force might exist on Touch
      pressure = e.touches[0].force || 0.5;
    } else if ('clientX' in e) {
      x = (e.clientX - rect.left) * dpr;
      y = (e.clientY - rect.top) * dpr;
      if ('pressure' in e) {
        pressure = e.pressure || 0.5;
        tiltX = e.tiltX || 0;
        tiltY = e.tiltY || 0;
      }
    } else {
      return;
    }
    
    const point = { x: x / dpr, y: y / dpr, pressure, tiltX, tiltY };
    const newPath = [...currentPath, point];
    setCurrentPath(newPath);
    
    if (currentPath.length > 0) {
      const prevPoint = currentPath[currentPath.length - 1];
      drawSegment(ctx, prevPoint, point, {
        tool: currentTool,
        color: currentColor,
        size: currentSize
      });
    }
  };

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerUp={stopDrawing}
      onPointerMove={draw}
      onPointerCancel={stopDrawing}
      onMouseDown={startDrawing}
      onMouseUp={stopDrawing}
      onMouseMove={draw}
      onTouchStart={startDrawing}
      onTouchEnd={stopDrawing}
      onTouchMove={draw}
      className={`w-full h-full cursor-crosshair rounded-lg ${
        overlayMode ? 'absolute inset-0 bg-transparent' : 'bg-slate-50/30'
      }`}
      style={{
        touchAction: isWritingMode ? 'none' : 'auto',
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
        pointerEvents: 'auto',
        cursor: isWritingMode ? 'crosshair' : 'grab'
      }}
    />
  );
});

export default DrawingCanvas;
