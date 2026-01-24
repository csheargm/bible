
import React, { useState, useCallback, useRef, useEffect } from 'react';
import BibleViewer from './components/BibleViewer';
import ChatInterface from './components/ChatInterface';
import VoiceSession from './components/VoiceSession';
import Notebook from './components/Notebook';
import ErrorBoundary from './components/ErrorBoundary';
import { SelectionInfo } from './types';
import { exportAllNotes, readLibraryFile } from './services/fileSystem';
import { notesStorage } from './services/notesStorage';

const App: React.FC = () => {
  const [splitOffset, setSplitOffset] = useState(100); // Default to full-screen Bible view
  const [bottomSplitOffset, setBottomSplitOffset] = useState(67); // Default to 2/3 for chat, 1/3 for notebook
  const [isResizing, setIsResizing] = useState(false);
  const [isBottomResizing, setIsBottomResizing] = useState(false);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [selectionPayload, setSelectionPayload] = useState<{ text: string; id: number } | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  // Note state management
  const [currentSelection, setCurrentSelection] = useState<SelectionInfo | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [notesLoading, setNotesLoading] = useState(true);

  // Load notes from IndexedDB on mount and migrate from localStorage if needed
  useEffect(() => {
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
    if (confirm(`确定要清除所有 ${noteCount} 条笔记吗？此操作无法撤销。建议先备份您的笔记。`)) {
      if (confirm(`再次确认：您真的要删除所有笔记吗？`)) {
        try {
          await notesStorage.clearAllNotes();
          setNotes({});
          alert("所有笔记已清除。");
        } catch (error) {
          console.error('Failed to clear notes from IndexedDB:', error);
          alert("清除笔记时出错，请重试。");
        }
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
    console.log('Start resizing horizontal divider');
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
    console.log('Start resizing vertical divider');
    setIsBottomResizing(true);
    // Prevent iOS bounce and other touch behaviors
    if ('touches' in e) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    }
  }, []);

  const stopResizing = useCallback(() => {
    console.log('Stop resizing');
    setIsResizing(false);
    setIsBottomResizing(false);
    // Restore scrolling
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  }, []);

  const resize = useCallback((e: MouseEvent | TouchEvent | PointerEvent) => {
    if (containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      
      // Get coordinates from either mouse or touch event
      const clientX = 'touches' in e ? e.touches[0]?.clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0]?.clientY : e.clientY;
      
      if (clientX === undefined || clientY === undefined) {
        console.log('No coordinates found');
        return;
      }
      
      if (isResizing) {
        const relativeY = clientY - containerRect.top;
        const percentage = (relativeY / containerRect.height) * 100;
        console.log('Horizontal resize:', percentage);
        if (percentage >= 0 && percentage <= 100) {
          setSplitOffset(percentage);
        }
      } else if (isBottomResizing) {
        const relativeX = clientX - containerRect.left;
        const percentage = (relativeX / containerRect.width) * 100;
        console.log('Vertical resize:', percentage);
        if (percentage > 20 && percentage < 80) {
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
      
      <header 
        className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 z-40 shadow-sm"
        style={{
          position: 'relative',
          minHeight: '56px',
          flexShrink: 0,
          WebkitFlexShrink: 0,
          display: '-webkit-box',
          display: '-webkit-flex',
          display: 'flex',
          WebkitBoxAlign: 'center',
          WebkitAlignItems: 'center',
          alignItems: 'center',
          WebkitBoxPack: 'justify',
          WebkitJustifyContent: 'space-between',
          justifyContent: 'space-between'
        }}
      >
        <div className="flex items-center gap-2" style={{ display: '-webkit-box', display: '-webkit-flex', display: 'flex' }}>
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold shadow-sm" style={{ flexShrink: 0, WebkitFlexShrink: 0 }}>圣</div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800" style={{ whiteSpace: 'nowrap' }}>经学研 · Scripture Scholar</h1>
        </div>
        <div className="flex items-center gap-3" style={{ display: '-webkit-box', display: '-webkit-flex', display: 'flex' }}>
          <div className="flex items-center gap-1.5 mr-2" style={{ display: '-webkit-box', display: '-webkit-flex', display: 'flex' }}>
            <button 
              onClick={handleBackupAll} 
              className="text-[10px] font-black uppercase text-slate-400 hover:text-indigo-600 transition-colors flex items-center gap-1 border border-slate-200 px-2 py-1 rounded"
              title="下载全部笔记到一个文件"
              style={{ display: '-webkit-box', display: '-webkit-flex', display: 'flex', WebkitAppearance: 'none' }}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ flexShrink: 0 }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
              全量备份
            </button>
            <button 
              onClick={handleRestoreClick} 
              className="text-[10px] font-black uppercase text-slate-400 hover:text-indigo-600 transition-colors flex items-center gap-1 border border-slate-200 px-2 py-1 rounded"
              title="从备份文件恢复全部笔记"
              style={{ display: '-webkit-box', display: '-webkit-flex', display: 'flex', WebkitAppearance: 'none' }}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ flexShrink: 0 }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              恢复库
            </button>
            <button 
              onClick={handleClearAll} 
              className="text-[10px] font-black uppercase text-slate-400 hover:text-red-600 transition-colors flex items-center gap-1 border border-slate-200 px-2 py-1 rounded"
              title="清除所有笔记"
              style={{ display: '-webkit-box', display: '-webkit-flex', display: 'flex', WebkitAppearance: 'none' }}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ flexShrink: 0 }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              清空库
            </button>
          </div>
          <button onClick={() => setIsVoiceOpen(true)} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-full text-xs font-bold hover:bg-indigo-100 transition-all border border-indigo-100 shadow-sm" style={{ display: '-webkit-box', display: '-webkit-flex', display: 'flex', WebkitAppearance: 'none' }}>
            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span></span>
            语音学者
          </button>
          <div className="h-4 w-[1px] bg-slate-200" style={{ flexShrink: 0 }}></div>
          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded uppercase tracking-tighter" style={{ whiteSpace: 'nowrap' }}>Bible Workspace</span>
        </div>
      </header>

      <main ref={containerRef} className="flex-1 flex flex-col relative overflow-hidden">
        <div className="shrink-0 overflow-hidden min-h-0" style={{ height: `${splitOffset}%` }}>
          <BibleViewer 
            notes={notes}
            onSelectionChange={setCurrentSelection}
            onVersesSelectedForChat={(text) => setSelectionPayload({ text, id: Date.now() })} 
          />
        </div>

        <div 
          className={`relative w-full flex items-center justify-center select-none z-30 transition-all group`}
          style={{ 
            height: '40px', 
            touchAction: 'none',
            WebkitTouchCallout: 'none',
            WebkitUserSelect: 'none',
            userSelect: 'none'
          }}
        >
          {/* Visible divider bar */}
          <div 
            className={`absolute w-full ${isResizing ? 'h-6 bg-indigo-500' : 'h-4 bg-slate-500 hover:bg-indigo-400 hover:h-5'} transition-all`}
            style={{
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2), 0 -2px 4px rgba(0, 0, 0, 0.2)'
            }}
          ></div>
          
          <div 
            onMouseDown={startResizing}
            onTouchStart={startResizing}
            onPointerDown={startResizing}
            className="absolute w-full h-full cursor-row-resize"
          ></div>
          
          {/* Arrow buttons for quick positioning */}
          <div className="relative flex items-center gap-2 bg-white px-3 py-1.5 rounded-full shadow-xl border-2 border-slate-500 z-40">
            {/* Up arrow - show more chat/notes (67% for Bible) */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSplitOffset(67);
              }}
              className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              title="Show chat and notes (⅔ screen)"
            >
              <svg className="w-5 h-5 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" />
              </svg>
            </button>
            
            {/* Drag indicator */}
            <div className="flex flex-col gap-1 px-2">
              <div className="w-10 h-1 bg-slate-700 rounded-full"></div>
              <div className="w-10 h-1 bg-slate-700 rounded-full"></div>
              <div className="w-10 h-1 bg-slate-700 rounded-full"></div>
            </div>
            
            {/* Down arrow - maximize Bible (100%) */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSplitOffset(100);
              }}
              className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              title="Maximize Bible reading"
            >
              <svg className="w-5 h-5 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden min-h-0">
          <div style={{ width: `${bottomSplitOffset}%` }} className="h-full overflow-hidden">
             <ChatInterface incomingText={selectionPayload} />
          </div>
          
          <div 
            className={`relative h-full flex items-center justify-center select-none z-30 transition-all group`}
            style={{ 
              width: '40px', 
              marginLeft: '-20px', 
              marginRight: '-20px',
              touchAction: 'none',
              WebkitTouchCallout: 'none',
              WebkitUserSelect: 'none',
              userSelect: 'none'
            }}
          >
            {/* Visible divider bar */}
            <div 
              className={`absolute h-full ${isBottomResizing ? 'w-6 bg-indigo-500' : 'w-4 bg-slate-500 hover:bg-indigo-400 hover:w-5'} transition-all`}
              style={{
                boxShadow: '2px 0 4px rgba(0, 0, 0, 0.2), -2px 0 4px rgba(0, 0, 0, 0.2)'
              }}
            ></div>
            
            <div 
              onMouseDown={startBottomResizing}
              onTouchStart={startBottomResizing}
              onPointerDown={startBottomResizing}
              className="absolute w-full h-full cursor-col-resize"
            ></div>
            
            <div className="relative flex flex-row gap-1 bg-white px-2 py-3 rounded-xl shadow-xl border-2 border-slate-500 z-40">
              <div className="w-1 h-10 bg-slate-700 rounded-full"></div>
              <div className="w-1 h-10 bg-slate-700 rounded-full"></div>
              <div className="w-1 h-10 bg-slate-700 rounded-full"></div>
            </div>
          </div>

          <div style={{ width: `${100 - bottomSplitOffset}%` }} className="h-full overflow-hidden">
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
