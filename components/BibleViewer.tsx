import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Verse, Book, SelectionInfo } from '../types';
import { BIBLE_BOOKS } from '../constants';
import { toSimplified } from '../services/chineseConverter';
import { bibleStorage } from '../services/bibleStorage';

interface BibleViewerProps {
  onSelectionChange?: (info: SelectionInfo) => void;
  onVersesSelectedForChat: (text: string) => void;
  notes: Record<string, string>;
  sidebarOpen?: boolean;
  showSidebarToggle?: boolean;
  onSidebarToggle?: () => void;
  isIPhone?: boolean;
  isReadingMode?: boolean;
  isResearchMode?: boolean;
  onDownloadStateChange?: (isDownloading: boolean, progress: number) => void;
  onDownloadFunctionsReady?: (downloadBible: () => void, downloadChapter: () => void) => void;
}


const BibleViewer: React.FC<BibleViewerProps> = ({ 
  onSelectionChange, 
  onVersesSelectedForChat, 
  notes, 
  sidebarOpen = false,
  showSidebarToggle = true,
  onSidebarToggle,
  isIPhone = false,
  isReadingMode = false,
  isResearchMode = false,
  onDownloadStateChange,
  onDownloadFunctionsReady 
}) => {
  const [selectedBook, setSelectedBook] = useState<Book>(BIBLE_BOOKS[0]);
  const [selectedChapter, setSelectedChapter] = useState(1);
  const [leftVerses, setLeftVerses] = useState<Verse[]>([]);
  const [rightVerses, setRightVerses] = useState<Verse[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedVerses, setSelectedVerses] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSimplified, setIsSimplified] = useState(() => {
    const saved = localStorage.getItem('bibleChineseMode');
    return saved === 'simplified';
  });
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isOffline, setIsOffline] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [isSwiping, setIsSwiping] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [offlineChapters, setOfflineChapters] = useState<Set<string>>(new Set());
  const [autoDownloadInProgress, setAutoDownloadInProgress] = useState(false);
  const downloadCancelRef = useRef(false);
  
  const [vSplitOffset, setVSplitOffset] = useState(100); // Start with Chinese maximized
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelContainerRef = useRef<HTMLDivElement>(null);

  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchChapter();
  }, [selectedBook, selectedChapter]);

  // Initialize storage and check offline status on mount
  useEffect(() => {
    // Run initialization in background without blocking UI
    const timer = setTimeout(() => {
      initializeStorage();
    }, 100);
    
    return () => clearTimeout(timer);
  }, []);

  const initializeStorage = async () => {
    try {
      // Initialize storage in background
      await bibleStorage.init();
      // Check offline status after storage is ready
      await checkOfflineStatus();
      await checkAndStartAutoDownload();
    } catch (error) {
      console.error('Error initializing storage:', error);
    }
  };

  const checkOfflineStatus = async () => {
    try {
      const offline = await bibleStorage.getAllOfflineChapters();
      setOfflineChapters(offline);
    } catch (error) {
      console.error('Error checking offline status:', error);
    }
  };

  const checkAndStartAutoDownload = async () => {
    try {
      const hasDownloadProgress = await bibleStorage.getMetadata('download_progress');
      
      // Only auto-resume if there's an incomplete download
      // Don't auto-start new downloads - let user initiate
      if (hasDownloadProgress && !isDownloading) {
        // Show resume option but don't auto-start
        console.log('Incomplete download detected. Use download menu to resume.');
      }
    } catch (error) {
      console.error('Error checking auto-download status:', error);
    }
  };

  const fetchChapter = async () => {
    setLoading(true);
    setError(null);
    
    // Check if chapter is available offline first
    let isChapterOffline = false;
    try {
      const cachedCuv = await bibleStorage.getChapter(selectedBook.id, selectedChapter, 'cuv');
      const cachedWeb = await bibleStorage.getChapter(selectedBook.id, selectedChapter, 'web');
      isChapterOffline = !!(cachedCuv && cachedWeb);
    } catch (err) {
      console.error('Error checking offline status:', err);
    }
    
    // Always try to fetch from API first for fresh content
    try {
      console.log(`Fetching ${selectedBook.id} chapter ${selectedChapter} from API...`);
      
      const [cuvRes, engRes] = await Promise.all([
        fetch(`https://bible-api.com/${selectedBook.id}${selectedChapter}?translation=cuv`),
        fetch(`https://bible-api.com/${selectedBook.id}${selectedChapter}?translation=web`)
      ]);
      
      const [cuvData, engData] = await Promise.all([
        cuvRes.json(),
        engRes.json()
      ]);
      
      if (cuvData?.verses && engData?.verses) {
        setLeftVerses(cuvData.verses);
        setRightVerses(engData.verses);
        setIsOffline(false);
        
        // Save to IndexedDB in background (non-blocking)
        if (!isChapterOffline) {
          console.log(`Saving ${selectedBook.id} chapter ${selectedChapter} to offline storage...`);
          Promise.all([
            bibleStorage.saveChapter(selectedBook.id, selectedChapter, 'cuv', cuvData),
            bibleStorage.saveChapter(selectedBook.id, selectedChapter, 'web', engData)
          ]).then(() => {
            console.log(`Successfully cached ${selectedBook.id} chapter ${selectedChapter}`);
            // Update offline chapters list
            checkOfflineStatus();
          }).catch(err => console.error('Failed to cache chapter:', err));
        }
      }
    } catch (fetchErr) {
      // If online fetch fails, try IndexedDB
      console.log("Online fetch failed, trying offline cache:", fetchErr.message);
      
      try {
        const cachedCuv = await bibleStorage.getChapter(selectedBook.id, selectedChapter, 'cuv');
        const cachedWeb = await bibleStorage.getChapter(selectedBook.id, selectedChapter, 'web');
        
        if (cachedCuv && cachedWeb) {
          console.log(`Loading ${selectedBook.id} chapter ${selectedChapter} from offline cache`);
          setLeftVerses(cachedCuv.verses);
          setRightVerses(cachedWeb.verses);
          setIsOffline(true);
        } else {
          console.log(`Chapter ${selectedBook.id} ${selectedChapter} not available offline`);
          setLeftVerses([]);
          setRightVerses([]);
          // Show a message that chapter is not available
          setError(`章节未缓存，需要网络连接`);
        }
      } catch (storageErr) {
        console.error("Storage error:", storageErr);
        setLeftVerses([]);
        setRightVerses([]);
      }
    } finally {
      setSelectedVerses([]);
      setLoading(false);
    }
  };

  const toggleChineseMode = () => {
    const newMode = !isSimplified;
    setIsSimplified(newMode);
    localStorage.setItem('bibleChineseMode', newMode ? 'simplified' : 'traditional');
  };

  const processChineseText = (text: string): string => {
    return isSimplified ? toSimplified(text) : text;
  };

  const handleDownloadCurrentChapter = async () => {
    setIsDownloading(true);
    setDownloadProgress(0);
    
    try {
      // Download current chapter with retry logic
      let cuvSuccess = false;
      for (let retry = 0; retry < 3 && !cuvSuccess; retry++) {
        try {
          const cuvRes = await fetch(`https://bible-api.com/${selectedBook.id}${selectedChapter}?translation=cuv`);
          if (cuvRes.ok) {
            const cuvData = await cuvRes.json();
            if (cuvData?.verses) {
              await bibleStorage.saveChapter(selectedBook.id, selectedChapter, 'cuv', cuvData);
              cuvSuccess = true;
            }
          }
        } catch (e) {
          if (retry === 2) throw e;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      setDownloadProgress(50);
      
      let webSuccess = false;
      for (let retry = 0; retry < 3 && !webSuccess; retry++) {
        try {
          const webRes = await fetch(`https://bible-api.com/${selectedBook.id}${selectedChapter}?translation=web`);
          if (webRes.ok) {
            const webData = await webRes.json();
            if (webData?.verses) {
              await bibleStorage.saveChapter(selectedBook.id, selectedChapter, 'web', webData);
              webSuccess = true;
            }
          }
        } catch (e) {
          if (retry === 2) throw e;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      setDownloadProgress(100);
      
      await checkOfflineStatus();
      fetchChapter(); // Refresh to show offline status
      alert(`${selectedBook.name} ${selectedChapter} 章已下载！`);
    } catch (err) {
      console.error('Download error:', err);
      alert('下载失败，请检查网络连接后重试。');
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
      setShowDownloadMenu(false);
    }
  };

  const downloadBibleInternal = async (startBookIndex = 0, startChapter = 0, startCompleted = 0, existingFailedChapters: string[] = [], saveProgress = true, isAuto = false) => {
    const books = BIBLE_BOOKS;
    let completed = startCompleted;
    const total = books.reduce((sum, book) => sum + (book.chapters || 0), 0) * 2; // *2 for both translations
    let failedChapters = [...existingFailedChapters];
    
    for (let bookIndex = startBookIndex; bookIndex < books.length; bookIndex++) {
      const book = books[bookIndex];
      const startChapterForBook = bookIndex === startBookIndex ? startChapter : 1;
      
      for (let chapter = startChapterForBook; chapter <= (book.chapters || 1); chapter++) {
        // Check if download was cancelled
        if (downloadCancelRef.current) {
          if (saveProgress) {
            await bibleStorage.saveMetadata('download_progress', {
              bookIndex,
              chapter,
              completed,
              totalChapters: total,
              failedChapters,
              timestamp: Date.now()
            });
          }
          return { cancelled: true, failedChapters };
        }

        // Skip if already downloaded
        const hasChapter = await bibleStorage.hasChapter(book.id, chapter);
        if (hasChapter) {
          completed += 2;
          setDownloadProgress(Math.round((completed / total) * 100));
          continue;
        }

        // Skip if previously failed
        if (failedChapters.includes(`${book.id} ${chapter}`)) {
          completed += 2;
          setDownloadProgress(Math.round((completed / total) * 100));
          continue;
        }

        try {
          // Add rate limiting delay between requests (500ms)
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Download CUV with retry logic
          let cuvSuccess = false;
          for (let retry = 0; retry < 3 && !cuvSuccess; retry++) {
            try {
              const cuvRes = await fetch(`https://bible-api.com/${book.id}${chapter}?translation=cuv`);
              if (cuvRes.ok) {
                const cuvData = await cuvRes.json();
                if (cuvData?.verses) {
                  await bibleStorage.saveChapter(book.id, chapter, 'cuv', cuvData);
                  cuvSuccess = true;
                }
              } else if (cuvRes.status === 429) {
                // Rate limited - wait longer
                console.log(`Rate limited on ${book.id} ${chapter}, waiting ${2 + retry}s...`);
                await new Promise(resolve => setTimeout(resolve, (2 + retry) * 1000));
              } else if (retry < 2) {
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            } catch (e) {
              if (retry === 2) throw e;
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
          if (!cuvSuccess) throw new Error('Failed to download CUV after retries');
          completed++;
          setDownloadProgress(Math.round((completed / total) * 100));
          
          // Add delay between translations too
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Download WEB with retry logic
          let webSuccess = false;
          for (let retry = 0; retry < 3 && !webSuccess; retry++) {
            try {
              const webRes = await fetch(`https://bible-api.com/${book.id}${chapter}?translation=web`);
              if (webRes.ok) {
                const webData = await webRes.json();
                if (webData?.verses) {
                  await bibleStorage.saveChapter(book.id, chapter, 'web', webData);
                  webSuccess = true;
                }
              } else if (webRes.status === 429) {
                // Rate limited - wait longer
                console.log(`Rate limited on ${book.id} ${chapter}, waiting ${2 + retry}s...`);
                await new Promise(resolve => setTimeout(resolve, (2 + retry) * 1000));
              } else if (retry < 2) {
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            } catch (e) {
              if (retry === 2) throw e;
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
          if (!webSuccess) throw new Error('Failed to download WEB after retries');
          completed++;
          setDownloadProgress(Math.round((completed / total) * 100));
          
        } catch (chapterErr) {
          console.error(`Failed to download ${book.id} ${chapter}:`, chapterErr);
          failedChapters.push(`${book.id} ${chapter}`);
          completed += 2; // Skip both translations
          setDownloadProgress(Math.round((completed / total) * 100));
        }
        
        // Save progress periodically
        if (saveProgress && completed % 10 === 0) {
          await bibleStorage.saveMetadata('download_progress', {
            bookIndex,
            chapter,
            completed,
            totalChapters: total,
            failedChapters,
            timestamp: Date.now()
          });
        }
        
        // Delay between chapters to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, isAuto ? 800 : 500));
      }
    }
    
    if (saveProgress) {
      await bibleStorage.deleteMetadata('download_progress');
    }
    
    return { cancelled: false, failedChapters };
  };

  const handleDownloadBible = async () => {
    setIsDownloading(true);
    setDownloadProgress(0);
    downloadCancelRef.current = false;
    
    try {
      const result = await downloadBibleInternal();
      
      if (!result.cancelled) {
        if (result.failedChapters.length > 0) {
          alert(`部分章节下载失败：${result.failedChapters.join(', ')}。其他章节已成功下载。`);
        } else {
          await bibleStorage.saveMetadata('bible_offline_downloaded', true);
          alert('圣经已成功下载供离线使用！');
        }
      }
    } catch (err) {
      console.error('Download error:', err);
      alert('下载失败，请检查网络连接后重试。');
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
      setShowDownloadMenu(false);
      await checkOfflineStatus();
    }
  };

  const handleAutoDownloadBible = async () => {
    if (autoDownloadInProgress) return;
    
    setAutoDownloadInProgress(true);
    setDownloadProgress(0);
    downloadCancelRef.current = false;
    
    try {
      const result = await downloadBibleInternal(0, 0, 0, [], true, true);
      
      if (!result.cancelled) {
        await bibleStorage.saveMetadata('bible_offline_downloaded', true);
      }
    } catch (err) {
      console.error('Auto-download error:', err);
    } finally {
      setAutoDownloadInProgress(false);
      setDownloadProgress(0);
      await checkOfflineStatus();
    }
  };

  const handleResumeDownload = async () => {
    const progress = await bibleStorage.getMetadata('download_progress');
    if (!progress) return;
    
    try {
      const { bookIndex, chapter, completed, failedChapters } = progress;
      setIsDownloading(true);
      setDownloadProgress(Math.round((completed / progress.totalChapters) * 100));
      downloadCancelRef.current = false;
      
      const result = await downloadBibleInternal(bookIndex, chapter + 1, completed, failedChapters || []);
      
      if (!result.cancelled) {
        if (result.failedChapters.length > 0) {
          alert(`部分章节下载失败：${result.failedChapters.join(', ')}。其他章节已成功下载。`);
        } else {
          await bibleStorage.saveMetadata('bible_offline_downloaded', true);
          alert('圣经已成功下载供离线使用！');
        }
      }
    } catch (err) {
      console.error('Resume download error:', err);
      alert('恢复下载失败，请重试。');
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
      setShowDownloadMenu(false);
      await checkOfflineStatus();
    }
  };

  const notifySelection = useCallback((verseNums: number[], manualText?: string) => {
    const id = verseNums.length > 0 
      ? `${selectedBook.id}:${selectedChapter}:${verseNums[0]}`
      : `${selectedBook.id}:${selectedChapter}`;
    
    let fullText = "";
    if (manualText) {
      fullText = manualText;
    } else if (verseNums.length > 0) {
      fullText = verseNums.map(vNum => {
        const leftV = leftVerses.find(v => v.verse === vNum);
        const rightV = rightVerses.find(v => v.verse === vNum);
        return `[${selectedBook.name} ${selectedChapter}:${vNum}]\n和合本: ${leftV?.text || ''}\nWEB: ${rightV?.text || ''}`;
      }).join('\n\n');
    }

    if (onSelectionChange) {
      onSelectionChange({
        bookId: selectedBook.id,
        bookName: selectedBook.name,
        chapter: selectedChapter,
        verseNums,
        id,
        selectedRawText: fullText
      });
    }

    onVersesSelectedForChat(fullText);
  }, [selectedBook, selectedChapter, leftVerses, rightVerses, onSelectionChange, onVersesSelectedForChat]);

  const handleVerseClick = (verseNum: number, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // In reading mode, don't respond to verse clicks
    if (isReadingMode) return;
    
    const selection = window.getSelection()?.toString();
    if (selection && selection.length > 0) return;

    const newSelection = [verseNum];
    setSelectedVerses(newSelection);
    notifySelection(newSelection);
  };

  const handleEmptySpaceClick = (e: React.MouseEvent) => {
    const selection = window.getSelection()?.toString();
    if (selection && selection.length > 0) return;

    const allVerses = leftVerses.map(v => v.verse);
    setSelectedVerses(allVerses);
    notifySelection(allVerses);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text && text.length > 0) {
      const anchorVerses = selectedVerses.length > 0 ? selectedVerses : [1];
      notifySelection(anchorVerses, text);
    }
  };

  const handleScroll = (source: 'left' | 'right') => {
    const src = source === 'left' ? leftScrollRef.current : rightScrollRef.current;
    const dest = source === 'left' ? rightScrollRef.current : leftScrollRef.current;
    if (src && dest) {
      dest.scrollTop = src.scrollTop;
    }
  };

  const startResizing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => setIsResizing(false), []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing && panelContainerRef.current) {
      const rect = panelContainerRef.current.getBoundingClientRect();
      const percentage = ((e.clientX - rect.left) / rect.width) * 100;
      if (percentage >= 0 && percentage <= 100) {
        setVSplitOffset(percentage);
      }
    }
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  const hasNoteMark = (verseNum: number) => {
    const id = `${selectedBook.id}:${selectedChapter}:${verseNum}`;
    return !!notes[id];
  };

  const navigateChapter = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      if (selectedChapter > 1) {
        setSelectedChapter(selectedChapter - 1);
      } else {
        const currentIndex = BIBLE_BOOKS.findIndex(b => b.id === selectedBook.id);
        if (currentIndex > 0) {
          const prevBook = BIBLE_BOOKS[currentIndex - 1];
          setSelectedBook(prevBook);
          setSelectedChapter(prevBook.chapters || 1);
        }
      }
    } else {
      if (selectedChapter < (selectedBook.chapters || 1)) {
        setSelectedChapter(selectedChapter + 1);
      } else {
        const currentIndex = BIBLE_BOOKS.findIndex(b => b.id === selectedBook.id);
        if (currentIndex < BIBLE_BOOKS.length - 1) {
          const nextBook = BIBLE_BOOKS[currentIndex + 1];
          setSelectedBook(nextBook);
          setSelectedChapter(1);
        }
      }
    }
    setSelectedVerses([]);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
    setIsSwiping(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const diff = e.touches[0].clientX - touchStartX;
    if (Math.abs(diff) > 10) {
      setIsSwiping(true);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null || !isSwiping) return;
    const diff = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(diff) > 50) {
      navigateChapter(diff > 0 ? 'prev' : 'next');
    }
    setTouchStartX(null);
    setIsSwiping(false);
  };

  const canNavigatePrev = selectedChapter > 1 || BIBLE_BOOKS.findIndex(b => b.id === selectedBook.id) > 0;
  const canNavigateNext = selectedChapter < (selectedBook.chapters || 1) || BIBLE_BOOKS.findIndex(b => b.id === selectedBook.id) < BIBLE_BOOKS.length - 1;

  // Check if there's incomplete download
  const [hasIncompleteDownload, setHasIncompleteDownload] = useState(false);
  useEffect(() => {
    bibleStorage.getMetadata('download_progress').then(progress => {
      setHasIncompleteDownload(!!progress);
    });
  }, [isDownloading]);

  // Expose download functions to parent
  useEffect(() => {
    if (onDownloadFunctionsReady) {
      onDownloadFunctionsReady(handleDownloadBible, handleDownloadCurrentChapter);
    }
  }, [handleDownloadBible, handleDownloadCurrentChapter, onDownloadFunctionsReady]);

  // Notify parent of download state changes
  useEffect(() => {
    if (onDownloadStateChange) {
      onDownloadStateChange(isDownloading || autoDownloadInProgress, downloadProgress);
    }
  }, [isDownloading, autoDownloadInProgress, downloadProgress, onDownloadStateChange]);

  return (
    <div 
      className="h-full flex flex-col bg-white overflow-hidden select-text" 
      ref={containerRef} 
      onClick={handleEmptySpaceClick}
      onMouseUp={handleMouseUp}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b bg-slate-50 sticky top-0 z-10 shrink-0 shadow-sm" onClick={e => e.stopPropagation()}>
        <div className="flex gap-3 items-center">
          {/* App Title integrated into Bible controls - responsive positioning */}
          <div 
            className={`flex items-center gap-2 ${!showSidebarToggle ? 'cursor-pointer' : ''}`}
            style={{ 
              marginLeft: showSidebarToggle ? (sidebarOpen ? '12px' : '52px') : '0px'
            }}
            onClick={!showSidebarToggle ? onSidebarToggle : undefined}
          >
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold shadow-sm">圣</div>
            {!isIPhone && (
              <h1 className="text-lg font-bold tracking-tight text-slate-800">经学研</h1>
            )}
            {!showSidebarToggle && (
              <svg className="w-4 h-4 text-slate-400 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            )}
          </div>
          <div className="h-6 w-[1px] bg-slate-300"></div>
          <button 
            onClick={() => navigateChapter('prev')}
            disabled={!canNavigatePrev}
            className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="上一章"
          >
            <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <select 
            className="p-1.5 rounded border bg-white text-sm focus:ring-2 focus:ring-indigo-500 font-medium"
            value={selectedBook.id}
            onChange={(e) => {
              const book = BIBLE_BOOKS.find(b => b.id === e.target.value);
              if (book) { setSelectedBook(book); setSelectedChapter(1); }
            }}
          >
            {BIBLE_BOOKS.map(book => <option key={book.id} value={book.id}>{book.name}</option>)}
          </select>
          <select 
            className="p-1.5 rounded border bg-white text-sm focus:ring-2 focus:ring-indigo-500 font-medium w-24"
            value={selectedChapter}
            onChange={(e) => setSelectedChapter(Number(e.target.value))}
          >
            {Array.from({ length: selectedBook.chapters || 1 }, (_, i) => i + 1).map(num => {
              const isOffline = offlineChapters.has(`${selectedBook.id}_${num}`);
              return (
                <option key={num} value={num}>
                  {isOffline ? '✓ ' : ''}第 {num} 章
                </option>
              );
            })}
          </select>
          <button 
            onClick={() => navigateChapter('next')}
            disabled={!canNavigateNext}
            className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="下一章"
          >
            <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleChineseMode}
            className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border border-slate-200 hover:border-indigo-300 transition-colors shadow-sm"
            title="切换简繁体"
          >
            <span className="text-xs font-medium text-slate-600">{isSimplified ? '简' : '繁'}</span>
          </button>
          {(isDownloading || autoDownloadInProgress) && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  downloadCancelRef.current = true;
                  setIsDownloading(false);
                  setAutoDownloadInProgress(false);
                  setDownloadProgress(0);
                }}
                className="flex items-center gap-1 px-2 py-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-sm"
                title="停止下载"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-xs font-medium">停止</span>
              </button>
              <div className="flex items-center gap-2 px-2 py-1 bg-white rounded-full border border-slate-200 shadow-sm">
                <div className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs font-medium text-slate-600">
                  {autoDownloadInProgress ? '自动 ' : ''}{downloadProgress}%
                </span>
              </div>
            </div>
          )}
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden lg:block">
            {selectedVerses.length === leftVerses.length && leftVerses.length > 0 ? '已选全章' : (selectedVerses.length > 0 ? `已选 ${selectedVerses.length} 节` : '点击经文或高亮文字')}
          </div>
          <div className="h-4 w-[1px] bg-slate-200 hidden lg:block"></div>
          <div className="flex items-center gap-1.5 px-3 py-1 bg-white rounded-full border border-slate-200 shadow-sm">
             <div className={`w-1.5 h-1.5 rounded-full ${isOffline ? 'bg-green-500' : 'bg-indigo-500 animate-pulse'}`}></div>
             <span className="text-[10px] font-bold text-slate-500">{isOffline ? '离线模式' : '在线'}</span>
          </div>
        </div>
      </div>

      <div 
        ref={panelContainerRef}
        className="flex-1 flex overflow-hidden relative"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div 
          ref={leftScrollRef}
          onScroll={() => handleScroll('left')}
          className="overflow-y-auto p-4 md:p-6 space-y-4 font-serif-sc border-r border-slate-100"
          style={{ 
            flexGrow: isResearchMode || vSplitOffset >= 100 ? 1 : 0,
            flexShrink: isResearchMode || vSplitOffset >= 100 ? 1 : 0,
            flexBasis: isResearchMode ? '100%' : vSplitOffset >= 100 ? 'calc(100% - 20px)' : vSplitOffset <= 0 ? '0%' : `calc(${vSplitOffset}% - 10px)`,
            minWidth: 0,
            display: vSplitOffset <= 0 && !isResearchMode ? 'none' : 'block'
          }}
        >
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">和合本 CUV</div>
          {loading ? (
            <div className="animate-pulse space-y-4">
              {[1,2,3,4,5].map(n => <div key={n} className="h-4 bg-slate-100 rounded w-full"></div>)}
            </div>
          ) : (
            leftVerses.map(v => (
              <div 
                key={`left-${v.verse}`}
                onClick={(e) => handleVerseClick(v.verse, e)}
                className={`p-2.5 rounded-lg transition-all border relative ${
                  selectedVerses.includes(v.verse) && !isReadingMode ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 
                  isReadingMode ? 'border-transparent' : 'border-transparent hover:bg-slate-50'
                }`}
                style={{ cursor: isReadingMode ? 'default' : 'pointer' }}
              >
                <span className="text-indigo-500 font-bold mr-3 text-xs">{v.verse}</span>
                <span className="text-lg leading-relaxed text-slate-800">{processChineseText(v.text)}</span>
                {hasNoteMark(v.verse) && (
                  <div className="absolute top-1 right-1 text-amber-500" title="已有笔记">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14h-4v-2h4v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div 
          className={`relative h-full flex items-center justify-center select-none z-30 transition-all group hover:bg-blue-50 flex-shrink-0`}
          style={{ 
            width: '20px',
            marginLeft: '0',
            marginRight: '0',
            touchAction: 'none',
            WebkitTouchCallout: 'none',
            WebkitUserSelect: 'none',
            userSelect: 'none',
            display: isResearchMode ? 'none' : 'flex'
          }}
        >
          {/* Visible divider bar */}
          <div 
            className={`absolute h-full ${isResizing ? 'w-2 bg-indigo-500' : 'w-1 bg-slate-200 group-hover:bg-indigo-400 group-hover:w-2'} transition-all`}
            style={{
              boxShadow: isResizing ? '2px 0 4px rgba(99, 102, 241, 0.3), -2px 0 4px rgba(99, 102, 241, 0.3)' : '1px 0 2px rgba(0, 0, 0, 0.05)'
            }}
          />
          
          <div 
            onMouseDown={startResizing}
            className="absolute w-full h-full cursor-col-resize"
          />
          
          {/* Arrow buttons and drag indicator */}
          <div 
            className="relative flex flex-col gap-1 bg-white/95 py-1.5 px-1 rounded-full shadow-lg border border-slate-300 hover:border-blue-300 z-40 cursor-col-resize transition-colors" 
            style={{ width: '20px' }}
          >
            {/* Left arrow - toggle between middle (50%) and maximize English (0%) */}
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                // If on right side (>50%), go to middle (50%)
                // If at middle or left side (<=50%), maximize English (0%)
                setVSplitOffset(vSplitOffset > 50 ? 50 : 0);
              }}
              className="p-px hover:bg-slate-200 rounded transition-colors flex items-center justify-center group"
              title={vSplitOffset > 50 ? "Center divider" : "Maximize English"}
              style={{ height: '14px', width: '14px' }}
            >
              <svg className="w-3 h-3 text-slate-500 group-hover:text-slate-700 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            
            {/* Drag indicator */}
            <div 
              onMouseDown={startResizing}
              onTouchStart={startResizing}
              className="flex flex-row gap-0.5 px-1 justify-center cursor-col-resize" 
              style={{ width: '14px' }}
            >
              <div className="w-0.5 h-4 bg-slate-300 pointer-events-none"></div>
              <div className="w-0.5 h-4 bg-slate-300 pointer-events-none"></div>
            </div>
            
            {/* Right arrow - toggle between middle (50%) and maximize Chinese (100%) */}
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                // If on left side (<50%), go to middle (50%)
                // If at middle or right side (>=50%), maximize Chinese (100%)
                setVSplitOffset(vSplitOffset < 50 ? 50 : 100);
              }}
              className="p-px hover:bg-slate-200 rounded transition-colors flex items-center justify-center group"
              title={vSplitOffset < 50 ? "Center divider" : "Maximize Chinese"}
              style={{ height: '14px', width: '14px' }}
            >
              <svg className="w-3 h-3 text-slate-500 group-hover:text-slate-700 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        <div 
          ref={rightScrollRef}
          onScroll={() => handleScroll('right')}
          className="overflow-y-auto p-4 md:p-6 space-y-4 font-sans"
          style={{ 
            flexGrow: vSplitOffset <= 0 ? 1 : 0,
            flexShrink: vSplitOffset <= 0 ? 1 : 0,
            flexBasis: vSplitOffset <= 0 ? 'calc(100% - 20px)' : vSplitOffset >= 100 ? '0%' : `calc(${100 - vSplitOffset}% - 10px)`,
            minWidth: 0,
            display: isResearchMode || vSplitOffset >= 100 ? 'none' : 'block'
          }}
        >
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">English (WEB)</div>
          {loading ? (
            <div className="animate-pulse space-y-4">
              {[1,2,3,4,5].map(n => <div key={n} className="h-4 bg-slate-100 rounded w-full"></div>)}
            </div>
          ) : (
            rightVerses.map(v => (
              <div 
                key={`right-${v.verse}`}
                onClick={(e) => handleVerseClick(v.verse, e)}
                className={`p-2.5 rounded-lg transition-all border ${
                  selectedVerses.includes(v.verse) && !isReadingMode ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 
                  isReadingMode ? 'border-transparent' : 'border-transparent hover:bg-slate-50'
                }`}
                style={{ cursor: isReadingMode ? 'default' : 'pointer' }}
              >
                <span className="text-indigo-400 font-bold mr-3 text-xs">{v.verse}</span>
                <span className="text-base leading-relaxed text-slate-700 italic">{v.text}</span>
              </div>
            ))
          )}
        </div>
      </div>
      
      {/* Non-blocking error notification */}
      {error && (
        <div className="absolute bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-in slide-in-from-bottom-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="ml-2 hover:text-red-100">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};

export default BibleViewer;
