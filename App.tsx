
import React, { useState, useCallback, useRef, useEffect } from 'react';
import BibleViewer from './components/BibleViewer';
import ChatInterface from './components/ChatInterface';
import VoiceSession from './components/VoiceSession';
import Notebook from './components/Notebook';
import Sidebar from './components/Sidebar';
import ErrorBoundary from './components/ErrorBoundary';
import { SelectionInfo } from './types';
import { exportAllNotes, readLibraryFile } from './services/fileSystem';
import { notesStorage } from './services/notesStorage';

const App: React.FC = () => {
  // Device detection for responsive layout
  const isIPhone = /iPhone|iPod/.test(navigator.userAgent);
  const isIPad = /iPad/.test(navigator.userAgent) || 
                 (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
  const isMobile = isIPhone || isIPad;
  
  // Track current mode implicitly based on layout
  const [appMode, setAppMode] = useState<'reading' | 'notes' | 'research'>('reading');
  
  const [splitOffset, setSplitOffset] = useState(100); // Always start maximized (full screen Bible)
  const [bottomSplitOffset, setBottomSplitOffset] = useState(67); // Default to 2/3 for chat, 1/3 for notebook
  const [isResizing, setIsResizing] = useState(false);
  const [isBottomResizing, setIsBottomResizing] = useState(false);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [selectionPayload, setSelectionPayload] = useState<{ text: string; id: number } | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  
  // Download functions that will be connected to BibleViewer
  const [downloadBible, setDownloadBible] = useState<(() => void) | null>(null);
  const [downloadChapter, setDownloadChapter] = useState<(() => void) | null>(null);
  const [downloadBook, setDownloadBook] = useState<(() => void) | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<string>('');
  const [downloadTimeRemaining, setDownloadTimeRemaining] = useState<string>('');
  
  const containerRef = useRef<HTMLDivElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  // Note state management
  const [currentSelection, setCurrentSelection] = useState<SelectionInfo | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [notesLoading, setNotesLoading] = useState(true);
  
  // Handle selection change - just update the selection without changing mode
  const handleSelectionChange = useCallback((selection: SelectionInfo | null) => {
    setCurrentSelection(selection);
    
    // If in notes mode and a verse is selected, ensure notes area is visible
    if (selection && appMode === 'notes') {
      // If Bible is maximized, move to 50% to show notes area
      if (splitOffset >= 90) {
        setSplitOffset(50);
      }
      // Make sure notes area is visible
      if (bottomSplitOffset > 50) {
        setBottomSplitOffset(0);
      }
    }
  }, [splitOffset, appMode, bottomSplitOffset]);
  
  // Comment out automatic mode detection to avoid conflicts with manual buttons
  // useEffect(() => {
  //   // Detect research mode: chat is visible (bottomSplitOffset > 50)
  //   if (bottomSplitOffset > 50 && splitOffset < 90) {
  //     setAppMode('research');
  //   }
  //   // Detect notes mode: notes are visible (bottomSplitOffset < 50) 
  //   else if (bottomSplitOffset < 50 && splitOffset < 90) {
  //     setAppMode('notes');
  //   }
  //   // Detect reading mode: Bible is maximized
  //   else if (splitOffset >= 90) {
  //     setAppMode('reading');
  //   }
  // }, [splitOffset, bottomSplitOffset]);
  
  // Load notes from IndexedDB on mount and migrate from localStorage if needed
  useEffect(() => {
    // Removed HTTPS redirect due to SSL certificate issues
    // Camera will only work on localhost or with proper SSL certificate
    
    const loadNotes = async () => {
      try {
        // First try to migrate from localStorage
        await notesStorage.migrateFromLocalStorage();
        // Then load all notes from IndexedDB
        const loadedNotes = await notesStorage.getAllNotes();
        setNotes(loadedNotes);
      } catch (error) {
        console.error('Failed to load notes from IndexedDB:', error);
      } finally {
        setNotesLoading(false);
      }
    };
    loadNotes();
  }, []);

  useEffect(() => {
    const checkKey = async () => {
      try {
        // Check if running in AI Studio environment
        if ((window as any).aistudio) {
          const selected = await (window as any).aistudio.hasSelectedApiKey();
          setHasKey(selected);
        } else {
          // Not in AI Studio, assume we have an API key from .env
          setHasKey(true);
        }
      } catch (error) {
        console.error('Error checking API key:', error);
        setHasKey(true); // Assume key exists to proceed
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    try {
      if ((window as any).aistudio) {
        await (window as any).aistudio.openSelectKey();
      }
      setHasKey(true);
    } catch (error) {
      console.error('Error selecting API key:', error);
    }
  };

  const handleSaveNote = useCallback(async (id: string, content: string) => {
    try {
      if (!content || content.trim() === "") {
        // Delete note from IndexedDB
        await notesStorage.deleteNote(id);
        setNotes(prev => {
          const updated = { ...prev };
          delete updated[id];
          return updated;
        });
      } else {
        // Save note to IndexedDB
        await notesStorage.saveNote(id, content);
        setNotes(prev => ({ ...prev, [id]: content }));
      }
    } catch (error) {
      console.error('Failed to save note to IndexedDB:', error);
    }
  }, []);

  const handleBackupAll = () => {
    if (Object.keys(notes).length === 0) {
      alert("当前没有可备份的笔记。");
      return;
    }
    exportAllNotes(notes);
  };

  const handleClearAll = async () => {
    if (Object.keys(notes).length === 0) {
      alert("当前没有笔记可以清除。");
      return;
    }
    
    const noteCount = Object.keys(notes).length;
    if (confirm(`确定要清除所有 ${noteCount} 条笔记吗？此操作无法撤销。`)) {
      try {
        await notesStorage.clearAllNotes();
        setNotes({});
        alert("所有笔记已清除。");
      } catch (error) {
        console.error('Failed to clear notes from IndexedDB:', error);
        alert("清除笔记时出错，请重试。");
      }
    }
  };

  const handleRestoreClick = () => {
    libraryInputRef.current?.click();
  };

  const handleLibraryImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (confirm("恢复备份将合并您的笔记。是否继续？")) {
      try {
        const importedNotes = await readLibraryFile(file);
        // Import to IndexedDB and update state
        await notesStorage.importNotes(importedNotes);
        const allNotes = await notesStorage.getAllNotes();
        setNotes(allNotes);
        alert("笔记库恢复成功！");
      } catch (err: any) {
        alert("恢复失败: " + err.message);
      }
    }
    e.target.value = "";
  };

  const startResizing = useCallback((e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    // Prevent iOS bounce and other touch behaviors
    if ('touches' in e) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    }
  }, []);

  const startBottomResizing = useCallback((e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsBottomResizing(true);
    // Prevent iOS bounce and other touch behaviors
    if ('touches' in e) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    }
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
    setIsBottomResizing(false);
    // Restore scrolling
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  }, []);

  const resize = useCallback((e: MouseEvent | TouchEvent | PointerEvent) => {
    if (containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      
      // Get coordinates from either mouse, touch, or pointer event
      let clientX: number | undefined;
      let clientY: number | undefined;
      
      if ('touches' in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if ('clientX' in e && 'clientY' in e) {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      
      if (clientX === undefined || clientY === undefined) {
        return;
      }
      
      if (isResizing) {
        const relativeY = clientY - containerRect.top;
        const height = containerRect.height;
        
        // Calculate percentage (0-100)
        const percentage = (relativeY / height) * 100;
        
        // Clamp to 0-100 range (flexbox handles the actual spacing)
        const clampedPercentage = Math.min(Math.max(0, percentage), 100);
        
        // Set the clamped percentage
        setSplitOffset(clampedPercentage);
      } else if (isBottomResizing) {
        const relativeX = clientX - containerRect.left;
        const percentage = (relativeX / containerRect.width) * 100;
        if (percentage >= 0 && percentage <= 100) {
          setBottomSplitOffset(percentage);
        }
      }
    }
  }, [isResizing, isBottomResizing]);

  useEffect(() => {
    if (isResizing || isBottomResizing) {
      // Mouse events
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
      // Touch events for iPad/mobile
      window.addEventListener('touchmove', resize, { passive: false });
      window.addEventListener('touchend', stopResizing);
      window.addEventListener('touchcancel', stopResizing);
      // Pointer events for better touch support
      window.addEventListener('pointermove', resize);
      window.addEventListener('pointerup', stopResizing);
      window.addEventListener('pointercancel', stopResizing);
    } else {
      // Remove mouse events
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      // Remove touch events
      window.removeEventListener('touchmove', resize);
      window.removeEventListener('touchend', stopResizing);
      window.removeEventListener('touchcancel', stopResizing);
      // Remove pointer events
      window.removeEventListener('pointermove', resize);
      window.removeEventListener('pointerup', stopResizing);
      window.removeEventListener('pointercancel', stopResizing);
    }
    return () => {
      // Cleanup all events
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      window.removeEventListener('touchmove', resize);
      window.removeEventListener('touchend', stopResizing);
      window.removeEventListener('touchcancel', stopResizing);
      window.removeEventListener('pointermove', resize);
      window.removeEventListener('pointerup', stopResizing);
      window.removeEventListener('pointercancel', stopResizing);
    };
  }, [isResizing, isBottomResizing, resize, stopResizing]);

  if (hasKey === false) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-6 text-center" style={{ backgroundColor: '#FAF8F3' }}>
        <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-3xl font-bold mb-6 shadow-lg">圣</div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">欢迎使用圣经学研</h1>
        <p className="text-slate-600 max-w-md mb-8">为了使用高级图像和视频创作功能，您需要选择一个已开启结算的 API 密钥。</p>
        <button onClick={handleSelectKey} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all active:scale-95">选择 API 密钥</button>
        <div className="mt-4"><a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-xs text-indigo-500 hover:underline">了解关于结算的更多信息</a></div>
      </div>
    );
  }

  return (
    <div 
      className="flex flex-col h-screen w-screen overflow-hidden"
      style={{
        display: '-webkit-box',
        display: '-webkit-flex',
        display: 'flex',
        WebkitBoxOrient: 'vertical',
        WebkitBoxDirection: 'normal',
        WebkitFlexDirection: 'column',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#FAF8F3' // Paper-like color similar to iOS Books
      }}
    >
      <input 
        type="file" 
        ref={libraryInputRef} 
        onChange={handleLibraryImport} 
        accept=".bible-library" 
        className="hidden" 
      />
      
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        showToggle={!isIPhone} // Hide toggle on iPhone to save space
        onBackup={handleBackupAll}
        onRestore={handleRestoreClick}
        onClear={handleClearAll}
        onVoiceOpen={() => setIsVoiceOpen(true)}
        notesCount={Object.keys(notes).length}
        onDownloadBible={downloadBible}
        onDownloadChapter={downloadChapter}
        onDownloadBook={downloadBook}
        downloadProgress={downloadProgress}
        isDownloading={isDownloading}
        downloadStatus={downloadStatus}
        downloadTimeRemaining={downloadTimeRemaining}
      />

      <main ref={containerRef} className="flex-1 flex flex-col relative overflow-hidden" style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        paddingTop: 0 // No padding since header is removed
      }}>
        {/* Bible viewer - flexbox based like the Bible's vertical divider */}
        <div className="overflow-hidden" style={{ 
          flexGrow: splitOffset >= 100 ? 1 : 0,
          flexShrink: splitOffset >= 100 ? 1 : 0,
          flexBasis: splitOffset >= 100 ? 'calc(100% - 24px)' : splitOffset <= 0 ? '0%' : `${splitOffset}%`,
          minHeight: 0
        }}>
          <BibleViewer 
            notes={notes}
            onSelectionChange={appMode !== 'reading' ? handleSelectionChange : undefined}
            onVersesSelectedForChat={(text) => setSelectionPayload({ text, id: Date.now() })}
            sidebarOpen={isSidebarOpen}
            showSidebarToggle={!isIPhone} // Pass iPhone detection to BibleViewer
            onSidebarToggle={() => setIsSidebarOpen(!isSidebarOpen)} // Allow title tap to open sidebar on iPhone
            isIPhone={isIPhone}
            isReadingMode={appMode === 'reading'}
            isResearchMode={appMode === 'research'}
            currentMode={appMode}
            onModeChange={(mode) => {
              setAppMode(mode);
              if (mode === 'reading') {
                setSplitOffset(100);
              } else if (mode === 'notes') {
                setSplitOffset(50);
                setBottomSplitOffset(0);
              } else if (mode === 'research') {
                setSplitOffset(50);
                setBottomSplitOffset(100);
              }
            }}
            onDownloadStateChange={(downloading, progress, status, timeRemaining) => {
              setIsDownloading(downloading);
              setDownloadProgress(progress);
              setDownloadStatus(status || '');
              setDownloadTimeRemaining(timeRemaining || '');
            }}
            onDownloadFunctionsReady={(downloadBibleFn, downloadChapterFn, downloadBookFn) => {
              // Only update if the functions have changed
              if (downloadBible !== downloadBibleFn) {
                setDownloadBible(() => downloadBibleFn);
              }
              if (downloadChapter !== downloadChapterFn) {
                setDownloadChapter(() => downloadChapterFn);
              }
              if (downloadBook !== downloadBookFn) {
                setDownloadBook(() => downloadBookFn);
              }
            }}
          />
        </div>

        {/* Divider with fixed height - always visible */}
        <div 
          className={`relative w-full flex items-center justify-center select-none z-30 transition-all group hover:bg-blue-50`}
          style={{ 
            flexShrink: 0,
            height: '32px',
            touchAction: 'none',
            WebkitTouchCallout: 'none',
            WebkitUserSelect: 'none',
            userSelect: 'none',
            position: 'relative',
            zIndex: 40
          }}
        >
          {/* Visible divider bar */}
          <div 
            className={`absolute w-full ${isResizing ? 'h-3 bg-indigo-500' : 'h-2 bg-slate-400 group-hover:bg-indigo-400 group-hover:h-3'} transition-all`}
            style={{
              boxShadow: isResizing ? '0 2px 4px rgba(99, 102, 241, 0.3)' : '0 1px 2px rgba(0, 0, 0, 0.05)',
              zIndex: 10 // Behind the controls
            }}
          ></div>
          
          {/* Invisible drag area - must be above visible bar but below controls */}
          <div 
            onMouseDown={startResizing}
            onTouchStart={startResizing}
            onPointerDown={startResizing}
            className="absolute w-full h-full cursor-row-resize"
            style={{ zIndex: 20 }}
          ></div>
          
          {/* Mode switcher - visible on all devices */}
          <div 
            className="absolute left-2 flex items-center gap-1 bg-white px-2 py-1 rounded-full shadow-xl border-2 border-slate-400 transition-colors" 
            style={{ height: '28px', zIndex: 60 }}
          >
            <button
              onClick={() => {
                setAppMode('reading');
                setSplitOffset(100);
              }}
              className={`px-3 py-1 text-sm font-bold rounded-full transition-all flex items-center justify-center ${
                appMode === 'reading' 
                  ? 'bg-indigo-600 text-white' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              style={{ minWidth: '32px', height: '22px' }}
              title="Reading mode - maximize Bible view"
            >
              📖
            </button>
            <button
              onClick={() => {
                setAppMode('notes');
                setSplitOffset(50);
                setBottomSplitOffset(0);
              }}
              className={`px-3 py-1 text-sm font-bold rounded-full transition-all flex items-center justify-center ${
                appMode === 'notes' 
                  ? 'bg-indigo-600 text-white' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              style={{ minWidth: '32px', height: '22px' }}
              title="Note taking mode - split view with notes"
            >
              ✏️
            </button>
            <button
              onClick={() => {
                setAppMode('research');
                setSplitOffset(50);
                setBottomSplitOffset(100);
              }}
              className={`px-3 py-1 text-sm font-bold rounded-full transition-all flex items-center justify-center ${
                appMode === 'research' 
                  ? 'bg-indigo-600 text-white' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              style={{ minWidth: '32px', height: '22px' }}
              title="Research mode - split view with AI chat"
            >
              🔬
            </button>
          </div>
          
          {/* Arrow buttons for quick positioning */}
          <div 
            className="relative flex items-center gap-1 bg-white px-2 py-1 rounded-full shadow-xl border-2 border-slate-400 hover:border-blue-400 transition-colors" 
            style={{ height: '20px', zIndex: 60 }}
          >
            {/* Up arrow - go to 50% when at bottom (100%), otherwise minimize/restore */}
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                // If at bottom (100%), go to 50%
                // If at 50-67%, go to 0% (minimize Bible)
                // Otherwise go to 67%
                if (splitOffset >= 100) {
                  setSplitOffset(50);
                } else if (splitOffset >= 50) {
                  setSplitOffset(0);
                } else {
                  setSplitOffset(67);
                }
              }}
              className="p-px hover:bg-slate-200 rounded transition-colors flex items-center justify-center group"
              title={splitOffset >= 100 ? "Split view (50/50)" : splitOffset >= 50 ? "Minimize Bible view" : "Show chat and notes (⅔ screen)"}
              style={{ height: '14px', width: '14px' }}
            >
              <svg className="w-3 h-3 text-slate-500 group-hover:text-slate-700 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" />
              </svg>
            </button>
            
            {/* Drag indicator */}
            <div 
              onMouseDown={startResizing}
              onTouchStart={startResizing}
              onPointerDown={startResizing}
              className="flex flex-col gap-0.5 px-1 justify-center cursor-row-resize" 
              style={{ height: '14px' }}
            >
              <div className="w-4 h-0.5 bg-slate-300 pointer-events-none"></div>
              <div className="w-4 h-0.5 bg-slate-300 pointer-events-none"></div>
            </div>
            
            {/* Down arrow - go to 50% when at top (0%), otherwise maximize */}
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                // If at top (0%), go to 50%
                // Otherwise go to 100% (maximize)
                if (splitOffset <= 0) {
                  setSplitOffset(50);
                } else {
                  setSplitOffset(100);
                }
              }}
              className="p-px hover:bg-slate-200 rounded transition-colors flex items-center justify-center group"
              title={splitOffset <= 0 ? "Split view (50/50)" : "Maximize Bible reading"}
              style={{ height: '14px', width: '14px' }}
            >
              <svg className="w-3 h-3 text-slate-500 group-hover:text-slate-700 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Bottom area - flexbox based to fill remaining space */}
        <div className="overflow-hidden flex" style={{ 
          flexGrow: splitOffset <= 0 ? 1 : 1,
          flexShrink: splitOffset <= 0 ? 1 : 1,
          flexBasis: splitOffset <= 0 ? 'calc(100% - 24px)' : splitOffset >= 100 ? '0%' : 'auto',
          minHeight: 0,
          display: splitOffset >= 100 ? 'none' : 'flex'
        }}>
          <div 
            className="h-full overflow-hidden"
            style={{ 
              flexGrow: bottomSplitOffset >= 100 ? 1 : 0,
              flexShrink: bottomSplitOffset >= 100 ? 1 : 0,
              flexBasis: bottomSplitOffset >= 100 ? 'calc(100% - 20px)' : bottomSplitOffset <= 0 ? '0%' : `calc(${bottomSplitOffset}% - 10px)`,
              minWidth: 0,
              display: bottomSplitOffset <= 0 ? 'none' : 'block'
            }}
          >
             <ChatInterface incomingText={selectionPayload} />
          </div>
          
          <div 
            className={`relative h-full flex items-center justify-center select-none z-30 transition-all group hover:bg-blue-50`}
            style={{ 
              width: '20px', 
              marginLeft: '0', 
              marginRight: '0',
              touchAction: 'none',
              WebkitTouchCallout: 'none',
              WebkitUserSelect: 'none',
              userSelect: 'none'
            }}
          >
            {/* Visible divider bar */}
            <div 
              className={`absolute h-full ${isBottomResizing ? 'w-2 bg-indigo-500' : 'w-1 bg-slate-200 group-hover:bg-indigo-400 group-hover:w-2'} transition-all`}
              style={{
                boxShadow: isBottomResizing ? '2px 0 4px rgba(99, 102, 241, 0.3), -2px 0 4px rgba(99, 102, 241, 0.3)' : '1px 0 2px rgba(0, 0, 0, 0.05)'
              }}
            ></div>
            
            <div 
              onMouseDown={startBottomResizing}
              onTouchStart={startBottomResizing}
              onPointerDown={startBottomResizing}
              className="absolute w-full h-full cursor-col-resize"
            ></div>
            
            <div 
              onMouseDown={startBottomResizing}
              onTouchStart={startBottomResizing}
              onPointerDown={startBottomResizing}
              className="relative flex flex-col gap-1 bg-white/95 py-1.5 px-1 rounded-full shadow-lg border border-slate-300 hover:border-blue-300 z-40 cursor-col-resize transition-colors" 
              style={{ width: '20px' }}
            >
              {/* Left arrow - toggle between middle (50%) and maximize notes (5%) */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  // If on right side (>50%), go to middle (50%)
                  // If at middle or left side (<=50%), maximize notes (0%)
                  setBottomSplitOffset(bottomSplitOffset > 50 ? 50 : 0);
                }}
                className="p-px hover:bg-slate-200 rounded transition-colors flex items-center justify-center group"
                title={bottomSplitOffset > 50 ? "Center divider" : "Maximize notes"}
                style={{ height: '10px', width: '10px' }}
              >
                <svg className="w-2 h-2 text-slate-500 group-hover:text-slate-700 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              
              {/* Drag indicator */}
              <div 
                onMouseDown={startBottomResizing}
                onTouchStart={startBottomResizing}
                className="flex flex-row gap-0.5 px-1 justify-center cursor-col-resize" 
                style={{ width: '14px' }}
              >
                <div className="w-0.5 h-4 bg-slate-300 pointer-events-none"></div>
                <div className="w-0.5 h-4 bg-slate-300 pointer-events-none"></div>
              </div>
              
              {/* Right arrow - toggle between middle (50%) and maximize chat (95%) */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  // If on left side (<50%), go to middle (50%)
                  // If at middle or right side (>=50%), maximize chat (100%)
                  setBottomSplitOffset(bottomSplitOffset < 50 ? 50 : 100);
                }}
                className="p-px hover:bg-slate-200 rounded transition-colors flex items-center justify-center group"
                title={bottomSplitOffset < 50 ? "Center divider" : "Maximize chat"}
                style={{ height: '10px', width: '10px' }}
              >
                <svg className="w-2 h-2 text-slate-500 group-hover:text-slate-700 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          <div 
            className="h-full overflow-hidden"
            style={{ 
              flexGrow: bottomSplitOffset <= 0 ? 1 : 0,
              flexShrink: bottomSplitOffset <= 0 ? 1 : 0,
              flexBasis: bottomSplitOffset <= 0 ? 'calc(100% - 20px)' : bottomSplitOffset >= 100 ? '0%' : `calc(${100 - bottomSplitOffset}% - 10px)`,
              minWidth: 0,
              display: bottomSplitOffset >= 100 ? 'none' : 'block'
            }}
          >
            <Notebook 
              selection={currentSelection} 
              onSaveNote={handleSaveNote}
              initialContent={currentSelection ? (notes[currentSelection.id] || '') : ''}
            />
          </div>
        </div>
      </main>

      <VoiceSession isOpen={isVoiceOpen} onClose={() => setIsVoiceOpen(false)} />

      {(isResizing || isBottomResizing) && (
        <style>{`* { user-select: none !important; cursor: inherit !important; }`}</style>
      )}
    </div>
  );
};

export default App;
