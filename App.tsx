
import React, { useState, useCallback, useRef, useEffect } from 'react';
import BibleViewer from './components/BibleViewer';
import ChatInterface from './components/ChatInterface';
import VoiceSession from './components/VoiceSession';
import EnhancedNotebook from './components/EnhancedNotebook';
import Sidebar from './components/Sidebar';
import ErrorBoundary from './components/ErrorBoundary';
import { SelectionInfo } from './types';
import { exportImportService } from './services/exportImportService';
import { notesStorage } from './services/notesStorage';
import { readingHistory } from './services/readingHistory';
import { verseDataStorage } from './services/verseDataStorage';
import { bibleStorage } from './services/bibleStorage';
import { BIBLE_BOOKS } from './constants';
import { Toast } from './components/Toast';
import { useDataStats } from './hooks/useDataStats';
import NotesList from './components/NotesList';

const App: React.FC = () => {
  // Device detection for responsive layout
  const isIPhone = /iPhone|iPod/.test(navigator.userAgent);
  
  // Initialize with last read position
  const [initialBookId, setInitialBookId] = useState<string | undefined>();
  const [initialChapter, setInitialChapter] = useState<number | undefined>();
  const [showResumeNotification, setShowResumeNotification] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const isIPad = /iPad/.test(navigator.userAgent) || 
                 (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
  const isMobile = isIPhone || isIPad;
  
  // Always in research mode now
  const [appMode, setAppMode] = useState<'reading' | 'notes' | 'research'>('research');
  
  const [splitOffset, setSplitOffset] = useState(100); // Start with Bible view at 100%
  const [bottomSplitOffset, setBottomSplitOffset] = useState(100); // Research view at 100% (notebook hidden)
  const [isResizing, setIsResizing] = useState(false);
  const [isBottomResizing, setIsBottomResizing] = useState(false);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [selectionPayload, setSelectionPayload] = useState<{ text: string; id: number; clearChat?: boolean } | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  
  // Download functions that will be connected to BibleViewer
  const [downloadBible, setDownloadBible] = useState<(() => void) | null>(null);
  const [downloadChapter, setDownloadChapter] = useState<(() => void) | null>(null);
  const [downloadBook, setDownloadBook] = useState<(() => void) | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<string>('');
  const [downloadTimeRemaining, setDownloadTimeRemaining] = useState<string>('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [dataUpdateTrigger, setDataUpdateTrigger] = useState(0);
  const [showNotesList, setShowNotesList] = useState(false);
  const [navigateTo, setNavigateTo] = useState<{ bookId: string; chapter: number; verses?: number[] } | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  // Note state management
  const [currentSelection, setCurrentSelection] = useState<SelectionInfo | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [notesLoading, setNotesLoading] = useState(true);
  const [researchUpdateTrigger, setResearchUpdateTrigger] = useState(0);
  const [currentBibleContext, setCurrentBibleContext] = useState<{bookId: string; chapter: number} | null>(null);
  
  // Handle selection change - just update the selection without changing mode
  const handleSelectionChange = useCallback((selection: SelectionInfo | null) => {
    setCurrentSelection(selection);
    
    // No mode-specific handling needed anymore
  }, [splitOffset, appMode, bottomSplitOffset]);

  // Handle Bible context change (book and chapter)
  const handleContextChange = useCallback((bookId: string, chapter: number) => {
    setCurrentBibleContext({ bookId, chapter });
  }, []);
  
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
        // First migrate old ID format if needed
        await verseDataStorage.migrateIds();
        // Then try to migrate from localStorage
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
    
    // Load last read position
    const lastRead = readingHistory.getLastRead();
    if (lastRead) {
      setInitialBookId(lastRead.bookId);
      setInitialChapter(lastRead.chapter);
      setShowResumeNotification(true);
      
      // Hide notification after 3 seconds
      setTimeout(() => {
        setShowResumeNotification(false);
      }, 3000);
    }
    setHistoryLoaded(true);
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
      // Parse the note ID to get book and chapter info
      const parts = id.split(':');
      if (parts.length >= 2) {
        const bookId = parts[0];
        const chapter = parseInt(parts[1]);
        
        if (!content || content.trim() === "") {
          // Delete note from IndexedDB
          await notesStorage.deleteNote(id);
          setDataUpdateTrigger(prev => prev + 1);
          setNotes(prev => {
            const updated = { ...prev };
            delete updated[id];
            return updated;
          });
          
          // Check if there are any other notes for this chapter
          const hasOtherNotes = Object.keys(notes).some(noteId => 
            noteId.startsWith(`${bookId}:${chapter}:`) && noteId !== id
          );
          
          // Update reading history status if no other notes remain
          if (!hasOtherNotes) {
            await readingHistory.updateChapterStatus(bookId, chapter, false, undefined);
          }
        } else {
          // Save note to IndexedDB
          await notesStorage.saveNote(id, content);
          setNotes(prev => ({ ...prev, [id]: content }));
          setDataUpdateTrigger(prev => prev + 1);
          
          // Update reading history to indicate this chapter has notes
          await readingHistory.updateChapterStatus(bookId, chapter, true, undefined);
        }
      }
    } catch (error) {
      console.error('Failed to save note to IndexedDB:', error);
    }
  }, [notes]);

  const handleBackupAll = async () => {
    try {
      console.log('Starting export...');
      setToast({ message: "正在导出数据... Exporting data...", type: 'info' });
      
      // Export all data (notes + Bible texts)
      const result = await exportImportService.exportAndDownloadAll();
      console.log('Export result:', result);
      
      if (result.success) {
        // Get counts for feedback - with error handling
        let noteCount = 0;
        let researchCount = 0;
        let chapterCount = 0;
        
        try {
          const allVerseData = await verseDataStorage.getAllData();
          noteCount = allVerseData.filter(v => v.personalNote).length;
          researchCount = allVerseData.reduce((acc, v) => acc + v.aiResearch.length, 0);
        } catch (e) {
          console.warn('Could not get verse data counts:', e);
        }
        
        try {
          const offlineChapters = await bibleStorage.getAllOfflineChapters();
          chapterCount = offlineChapters.size;
        } catch (e) {
          console.warn('Could not get chapter count:', e);
        }
        
        let message = `成功导出！Successfully exported!\n`;
        if (noteCount > 0) message += `${noteCount} 条笔记 notes, `;
        if (researchCount > 0) message += `${researchCount} 条研究 research, `;
        if (chapterCount > 0) message += `${chapterCount} 章圣经 Bible chapters`;
        
        // If no counts available, show simple success
        if (noteCount === 0 && researchCount === 0 && chapterCount === 0) {
          message = '成功导出数据！Successfully exported data!';
        }
        
        setToast({ message: message.trim().replace(/, $/, ''), type: 'success' });
      } else {
        throw new Error(result.error || 'Export failed');
      }
    } catch (error: any) {
      console.error('Failed to export:', error);
      setToast({ message: `导出失败: ${error.message || error} Failed to export.`, type: 'error' });
    }
  };

  const handleClearAll = async () => {
    try {
      // Get counts of all data
      const allVerseData = await verseDataStorage.getAllData();
      const noteCount = allVerseData.filter(v => v.personalNote).length;
      const researchCount = allVerseData.reduce((acc, v) => acc + v.aiResearch.length, 0);
      const oldNotesCount = Object.keys(notes).length;
      
      const totalCount = noteCount + researchCount + oldNotesCount;
      
      if (totalCount === 0) {
        setToast({ message: "当前没有数据可以清除。 No data to clear.", type: 'info' });
        return;
      }
      
      // Build confirmation message
      let confirmMsg = `确定要清除所有数据吗？Are you sure you want to delete all data?\n\n`;
      if (noteCount > 0) confirmMsg += `${noteCount} 条笔记 notes\n`;
      if (researchCount > 0) confirmMsg += `${researchCount} 条AI研究 AI research\n`;
      if (oldNotesCount > 0) confirmMsg += `${oldNotesCount} 条旧笔记 old notes\n`;
      confirmMsg += '\n此操作无法撤销！This cannot be undone!';
      
      if (confirm(confirmMsg)) {
        // Show loading state
        setToast({ message: "正在清除数据... Clearing data...", type: 'info' });
        
        // Clear all data from all storage locations
        await Promise.all([
          notesStorage.clearAllNotes(),
          verseDataStorage.clearAllPersonalNotes(),
          verseDataStorage.clearAllAIResearch()
        ]);
        setNotes({});
        
        // Trigger stats update
        setDataUpdateTrigger(prev => prev + 1);
        
        // Show success after clearing
        setTimeout(() => {
          let successMsg = `成功清除！Successfully cleared!\n`;
          if (noteCount > 0) successMsg += `${noteCount} 条笔记 notes, `;
          if (researchCount > 0) successMsg += `${researchCount} 条研究 research, `;
          if (oldNotesCount > 0) successMsg += `${oldNotesCount} 条旧笔记 old notes`;
          
          setToast({ message: successMsg.trim().replace(/, $/, ''), type: 'success' });
        }, 100);
      }
    } catch (error) {
      console.error('Failed to clear data:', error);
      setToast({ message: "清除数据时出错，请重试。 Failed to clear data.", type: 'error' });
    }
  };

  const handleRestoreClick = () => {
    libraryInputRef.current?.click();
  };

  const handleLibraryImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (confirm("恢复备份将合并您的笔记。是否继续？ Restore backup will merge your notes. Continue?")) {
      try {
        setToast({ message: "正在读取备份... Reading backup...", type: 'info' });
        
        // Read file content
        const content = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = reject;
          reader.readAsText(file);
        });
        
        // Import using the new service
        const result = await exportImportService.importCombinedBackup(content, 'merge_combine');
        
        if (result.success || result.notesImported > 0 || result.chaptersImported > 0) {
          // Refresh notes display
          const allNotes = await notesStorage.getAllNotes();
          setNotes(allNotes);
          
          // Trigger stats update
          setDataUpdateTrigger(prev => prev + 1);
          
          // Build success message
          let message = `恢复成功！Successfully restored!\n`;
          if (result.notesImported > 0) message += `${result.notesImported} 条笔记 notes, `;
          if (result.notesSkipped > 0) message += `${result.notesSkipped} 跳过 skipped, `;
          if (result.chaptersImported > 0) message += `${result.chaptersImported} 章圣经 Bible chapters`;
          
          setToast({ message: message.trim().replace(/, $/, ''), type: 'success' });
          
          if (result.errors.length > 0) {
            console.warn('Import warnings:', result.errors);
          }
        } else {
          throw new Error(result.errors.join('; ') || 'Import failed');
        }
      } catch (err: any) {
        setToast({ message: `恢复失败: ${err.message} Failed to restore: ${err.message}`, type: 'error' });
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
        accept=".json,.bible-library" 
        className="hidden" 
      />
      
      {/* Resume notification */}
      {showResumeNotification && initialBookId && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50">
          <div className="bg-white px-4 py-2 rounded-lg shadow-lg border border-indigo-200 animate-pulse">
            <p className="text-sm text-slate-700">
              📖 恢复到: <span className="font-medium">{BIBLE_BOOKS.find(b => b.id === initialBookId)?.name} 第 {initialChapter} 章</span>
            </p>
          </div>
        </div>
      )}
      
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        showToggle={!isIPhone} // Hide toggle on iPhone to save space
        onBackup={handleBackupAll}
        onRestore={handleRestoreClick}
        onClear={handleClearAll}
        onVoiceOpen={() => setIsVoiceOpen(true)}
        onViewNotes={() => {
          setShowNotesList(true);
          setIsSidebarOpen(false);
        }}
        onSplitView={() => {
          setSplitOffset(50);
          setIsSidebarOpen(false);
        }}
        notesCount={Object.keys(notes).length}
        onDownloadBible={downloadBible}
        onDownloadChapter={downloadChapter}
        onDownloadBook={downloadBook}
        dataUpdateTrigger={dataUpdateTrigger}
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
          {historyLoaded && (
            <BibleViewer 
              notes={notes}
              researchUpdateTrigger={researchUpdateTrigger}
              onSelectionChange={handleSelectionChange}
              onVersesSelectedForChat={(text, clearChat) => setSelectionPayload({ text, id: Date.now(), clearChat })}
              onContextChange={handleContextChange}
              sidebarOpen={isSidebarOpen}
              showSidebarToggle={!isIPhone} // Pass iPhone detection to BibleViewer
              onSidebarToggle={() => setIsSidebarOpen(!isSidebarOpen)} // Allow title tap to open sidebar on iPhone
              isIPhone={isIPhone}
              initialBookId={initialBookId}
              initialChapter={initialChapter}
              navigateTo={navigateTo}
              onLayoutChange={(splitOffset, bottomSplitOffset) => {
                setSplitOffset(splitOffset);
                setBottomSplitOffset(bottomSplitOffset);
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
          )}
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
          
          
          {/* Arrow buttons for quick positioning */}
          <div 
            className="relative flex items-center gap-1 bg-white px-2 py-1 rounded-full shadow-xl border-2 border-slate-400 hover:border-blue-400 transition-colors" 
            style={{ height: isIPhone ? '36px' : '20px', zIndex: 60 }}
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
              style={{ height: isIPhone ? '28px' : '14px', width: isIPhone ? '28px' : '14px' }}
            >
              <svg className={`${isIPhone ? 'w-6 h-6' : 'w-3 h-3'} text-slate-500 group-hover:text-slate-700 transition-colors`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" />
              </svg>
            </button>
            
            {/* Drag indicator */}
            <div 
              onMouseDown={startResizing}
              onTouchStart={startResizing}
              onPointerDown={startResizing}
              className="flex flex-col gap-0.5 px-1 justify-center cursor-row-resize" 
              style={{ height: isIPhone ? '28px' : '14px' }}
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
              style={{ height: isIPhone ? '28px' : '14px', width: isIPhone ? '28px' : '14px' }}
            >
              <svg className={`${isIPhone ? 'w-6 h-6' : 'w-3 h-3'} text-slate-500 group-hover:text-slate-700 transition-colors`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
             <ChatInterface 
               incomingText={selectionPayload}
               currentBookId={currentBibleContext?.bookId}
               currentChapter={currentBibleContext?.chapter}
               onResearchSaved={() => {
                 setResearchUpdateTrigger(prev => prev + 1);
                 setDataUpdateTrigger(prev => prev + 1);
               }}
             />
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
            <EnhancedNotebook 
              selection={currentSelection} 
              onSaveNote={handleSaveNote}
              initialContent={currentSelection ? (notes[currentSelection.id] || '') : ''}
            />
          </div>
        </div>
      </main>

      <VoiceSession isOpen={isVoiceOpen} onClose={() => setIsVoiceOpen(false)} />
      
      {/* Notes List Modal */}
      {showNotesList && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl h-[80vh] overflow-hidden">
            <NotesList
              onClose={() => setShowNotesList(false)}
              onSelectNote={(bookId, chapter, verses) => {
                // Navigate to the selected note
                setShowNotesList(false);
                
                // Adjust layout for optimal note viewing: horizontal divider to 50%, notes view to 100%
                setSplitOffset(50);
                setBottomSplitOffset(0); // 0 means notes view is maximized
                
                // Navigate BibleViewer to this chapter
                setNavigateTo({ bookId, chapter, verses });
                
                // Also trigger selection change to open the note view like hover popup does
                if (verses && verses.length > 0) {
                  const selectedBook = BIBLE_BOOKS.find(b => b.id === bookId);
                  const noteId = `${bookId}:${chapter}:${verses[0]}`;
                  
                  const selectionInfo = {
                    id: noteId,
                    bookId: bookId,
                    bookName: selectedBook?.name || '',
                    chapter: chapter,
                    verseNums: verses,
                    selectedRawText: '' // This will be populated when the BibleViewer loads
                  };
                  
                  // Delay the selection change slightly to ensure BibleViewer has navigated first
                  setTimeout(() => {
                    handleSelectionChange(selectionInfo);
                  }, 200);
                }
                
                // Clear navigation after a short delay to allow for re-navigation to same location
                setTimeout(() => setNavigateTo(null), 100);
              }}
            />
          </div>
        </div>
      )}

      {(isResizing || isBottomResizing) && (
        <style>{`* { user-select: none !important; cursor: inherit !important; }`}</style>
      )}
      
      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default App;
