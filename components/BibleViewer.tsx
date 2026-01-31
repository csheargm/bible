import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Verse, Book, SelectionInfo } from '../types';
import { BIBLE_BOOKS } from '../constants';
import { toSimplified } from '../services/chineseConverter';
import { bibleStorage } from '../services/bibleStorage';
import { readingHistory } from '../services/readingHistory';
import { verseDataStorage } from '../services/verseDataStorage';
import { ReadingHistory } from './ReadingHistory';
import VerseIndicators from './VerseIndicators';
import ContextMenu from './ContextMenu';

interface BibleViewerProps {
  onSelectionChange?: (info: SelectionInfo) => void;
  onVersesSelectedForChat: (text: string, clearChat?: boolean) => void;
  notes: Record<string, string>;
  researchUpdateTrigger?: number;
  onContextChange?: (bookId: string, chapter: number) => void;
  sidebarOpen?: boolean;
  showSidebarToggle?: boolean;
  onSidebarToggle?: () => void;
  isIPhone?: boolean;
  onDownloadStateChange?: (isDownloading: boolean, progress: number, status?: string, timeRemaining?: string) => void;
  onDownloadFunctionsReady?: (downloadBible: () => void, downloadChapter: () => void, downloadBook: () => void) => void;
  initialBookId?: string;
  initialChapter?: number;
  navigateTo?: { bookId: string; chapter: number; verses?: number[] } | null;
  onLayoutChange?: (splitOffset: number, bottomSplitOffset: number) => void;
}


const BibleViewer: React.FC<BibleViewerProps> = ({ 
  onSelectionChange, 
  onVersesSelectedForChat, 
  notes, 
  researchUpdateTrigger = 0,
  onContextChange,
  sidebarOpen = false,
  showSidebarToggle = true,
  onSidebarToggle,
  isIPhone = false,
  onDownloadStateChange,
  onDownloadFunctionsReady,
  initialBookId,
  initialChapter,
  navigateTo,
  onLayoutChange
}) => {
  const [selectedBook, setSelectedBook] = useState<Book>(() => {
    if (initialBookId) {
      const book = BIBLE_BOOKS.find(b => b.id === initialBookId);
      if (book) return book;
    }
    return BIBLE_BOOKS[0];
  });
  const [selectedChapter, setSelectedChapter] = useState(initialChapter || 1);
  const [leftVerses, setLeftVerses] = useState<Verse[]>([]);
  const [rightVerses, setRightVerses] = useState<Verse[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedVerses, setSelectedVerses] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSimplified, setIsSimplified] = useState(() => {
    const saved = localStorage.getItem('bibleChineseMode');
    return saved === 'simplified';
  });
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem('bibleFontSize');
    return saved ? parseInt(saved) : 18;
  });
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState<string>('');
  const [downloadStartTime, setDownloadStartTime] = useState<number>(0);
  const [downloadTimeRemaining, setDownloadTimeRemaining] = useState<string>('');
  const [isOffline, setIsOffline] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [swipeDirection, setSwipeDirection] = useState<'horizontal' | 'vertical' | null>(null);
  const [isSwiping, setIsSwiping] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isPageFlipping, setIsPageFlipping] = useState(false);
  const [flipDirection, setFlipDirection] = useState<'left' | 'right' | null>(null);
  const [nextChapterVerses, setNextChapterVerses] = useState<Verse[]>([]);
  const [prevChapterVerses, setPrevChapterVerses] = useState<Verse[]>([]);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [offlineChapters, setOfflineChapters] = useState<Set<string>>(new Set());
  const [autoDownloadInProgress, setAutoDownloadInProgress] = useState(false);
  const downloadCancelRef = useRef(false);
  
  // Book search state
  const [bookSearchTerm, setBookSearchTerm] = useState('');
  const [showBookDropdown, setShowBookDropdown] = useState(false);
  const bookSearchRef = useRef<HTMLDivElement>(null);
  
  // Mobile menu state
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  
  const [vSplitOffset, setVSplitOffset] = useState(100); // Start with Chinese maximized
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelContainerRef = useRef<HTMLDivElement>(null);

  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  
  // Reading history state
  const [showReadingHistory, setShowReadingHistory] = useState(false);
  const [chaptersWithContent, setChaptersWithContent] = useState<{
    withNotes: Set<number>;
    withResearch: Set<number>;
  }>({ withNotes: new Set(), withResearch: new Set() });
  const [verseData, setVerseData] = useState<Record<string, { hasNote: boolean; hasResearch: boolean; notePreview?: string; researchCount?: number }>>({});
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    position: { x: number; y: number };
    selectedText: string;
    verseInfo?: {
      bookId: string;
      bookName: string;
      chapter: number;
      verseNum: number;
      fullVerseText: string;
    };
  } | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  // iOS two-step text selection state (isolated)
  const [iosTextSelectionReady, setIosTextSelectionReady] = useState(false);
  
  // Better iOS detection that works for modern iPads
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // Notify parent when book or chapter changes
  useEffect(() => {
    if (onContextChange) {
      onContextChange(selectedBook.id, selectedChapter);
    }
  }, [selectedBook.id, selectedChapter, onContextChange]);

  // Handle external navigation requests
  useEffect(() => {
    if (navigateTo) {
      const book = BIBLE_BOOKS.find(b => b.id === navigateTo.bookId);
      if (book) {
        setSelectedBook(book);
        setSelectedChapter(navigateTo.chapter);
        // If specific verses are provided, select them
        if (navigateTo.verses && navigateTo.verses.length > 0) {
          setSelectedVerses(navigateTo.verses);
        }
      }
    }
  }, [navigateTo]);

  // Load chapters with content when book changes
  useEffect(() => {
    const loadChaptersWithContent = async () => {
      const content = await readingHistory.getChaptersWithContent(selectedBook.id);
      setChaptersWithContent(content);
    };
    loadChaptersWithContent();
  }, [selectedBook.id]);
  
  // Load verse data for current chapter
  useEffect(() => {
    const loadVerseData = async () => {
      const data: Record<string, { hasNote: boolean; hasResearch: boolean; notePreview?: string; researchCount?: number }> = {};
      
      // Check each verse in the current chapter
      for (const verse of [...leftVerses, ...rightVerses]) {
        const verseId = `${selectedBook.id}:${selectedChapter}:${verse.verse}`;
        const verseInfo = await verseDataStorage.getVerseData(selectedBook.id, selectedChapter, [verse.verse]);
        
        const hasNote = !!verseInfo?.personalNote?.text || !!notes[verseId];
        const hasResearch = !!verseInfo?.aiResearch && verseInfo.aiResearch.length > 0;
        
        // Get the preview text (from personal note or latest AI research)
        let notePreviewText = '';
        if (verseInfo?.personalNote?.text) {
          // Personal note from verseDataStorage (new system)
          notePreviewText = verseInfo.personalNote.text;
        } else if (notes[verseId]) {
          // Note from old notes system
          notePreviewText = notes[verseId];
        } else if (verseInfo?.aiResearch && verseInfo.aiResearch.length > 0) {
          // Show latest AI research as preview if no personal note
          const latestResearch = verseInfo.aiResearch[0];
          notePreviewText = `Q: ${latestResearch.query}\nA: ${latestResearch.response}`;
        }
        
        data[verseId] = {
          hasNote,
          hasResearch,
          notePreview: notePreviewText || undefined,
          researchCount: verseInfo?.aiResearch?.length || 0
        };
        
      }
      
      setVerseData(data);
    };
    
    if (leftVerses.length > 0 || rightVerses.length > 0) {
      loadVerseData();
    }
  }, [leftVerses, rightVerses, selectedBook.id, selectedChapter, notes, researchUpdateTrigger]);

  // No need for mode-specific text selection clearing anymore

  useEffect(() => {
    fetchChapter();
    // Always preload adjacent chapters for smooth navigation
    // Preload next chapter
    if (selectedChapter < (selectedBook.chapters || 1)) {
      fetchChapterData(selectedBook.id, selectedChapter + 1).then(data => {
        if (data) setNextChapterVerses(data.left);
      });
    } else {
      // Next book first chapter
      const currentIndex = BIBLE_BOOKS.findIndex(b => b.id === selectedBook.id);
      if (currentIndex < BIBLE_BOOKS.length - 1) {
        const nextBook = BIBLE_BOOKS[currentIndex + 1];
        fetchChapterData(nextBook.id, 1).then(data => {
          if (data) setNextChapterVerses(data.left);
        });
      }
    }
    
    // Preload previous chapter
    if (selectedChapter > 1) {
      fetchChapterData(selectedBook.id, selectedChapter - 1).then(data => {
        if (data) setPrevChapterVerses(data.left);
      });
    } else {
      // Previous book last chapter
      const currentIndex = BIBLE_BOOKS.findIndex(b => b.id === selectedBook.id);
      if (currentIndex > 0) {
        const prevBook = BIBLE_BOOKS[currentIndex - 1];
        fetchChapterData(prevBook.id, prevBook.chapters || 1).then(data => {
          if (data) setPrevChapterVerses(data.left);
        });
      }
    }
    
    // Don't aggressively preload to avoid rate limiting
    // Only adjacent chapters are preloaded above
    
    // Track reading history
    readingHistory.saveLastRead(selectedBook.id, selectedBook.name, selectedChapter);
    
    // Check if current chapter has notes
    const chapterHasNotes = Object.keys(notes).some(noteId => 
      noteId.startsWith(`${selectedBook.id}:${selectedChapter}:`)
    );
    
    readingHistory.addToHistory(
      selectedBook.id, 
      selectedBook.name, 
      selectedChapter,
      chapterHasNotes,
      false  // hasAIResearch - will be updated separately when AI features are implemented
    );
  }, [selectedBook, selectedChapter, notes]);
  
  // Handle clicking outside book dropdown and mobile menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (bookSearchRef.current && !bookSearchRef.current.contains(event.target as Node)) {
        setShowBookDropdown(false);
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setShowMobileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      
      // Don't auto-download to avoid rate limiting
      // User can manually download if needed
      if (hasDownloadProgress && !isDownloading) {
      }
    } catch (error) {
      console.error('Error checking auto-download status:', error);
    }
  };

  // Helper function to fetch chapter data without setting loading state
  const fetchChapterData = async (bookId: string, chapter: number) => {
    // Always check cache first to avoid unnecessary API calls
    try {
      const cachedCuv = await bibleStorage.getChapter(bookId, chapter, 'cuv');
      const cachedWeb = await bibleStorage.getChapter(bookId, chapter, 'web');
      if (cachedCuv && cachedWeb && cachedCuv.verses && cachedWeb.verses) {
        return {
          left: cachedCuv.verses,
          right: cachedWeb.verses
        };
      }
    } catch {}
    
    // For preloading, don't fetch from network to avoid rate limiting
    // Only fetch when explicitly needed (in fetchChapter function)
    return null;
  };

  const fetchChapter = async () => {
    setLoading(true);
    setError(null);
    
    // First, try to load from cache for instant display
    let loadedFromCache = false;
    try {
      const cachedCuv = await bibleStorage.getChapter(selectedBook.id, selectedChapter, 'cuv');
      const cachedWeb = await bibleStorage.getChapter(selectedBook.id, selectedChapter, 'web');
      
      if (cachedCuv && cachedWeb && cachedCuv.verses && cachedWeb.verses) {
        // Use cached data immediately for instant loading
        setLeftVerses(cachedCuv.verses);
        setRightVerses(cachedWeb.verses);
        loadedFromCache = true;
        setLoading(false);
        setError(null); // Clear any previous errors
        
        // Try to update from network in background (don't show loading)
        fetch(`https://bible-api.com/${selectedBook.id}${selectedChapter}?translation=cuv`)
          .then(res => res.json())
          .then(data => {
            if (data.verses) {
              setLeftVerses(data.verses);
              bibleStorage.saveChapter(selectedBook.id, selectedChapter, 'cuv', data).catch(() => {});
            }
          })
          .catch(() => {}); // Silent fail for background update
          
        fetch(`https://bible-api.com/${selectedBook.id}${selectedChapter}?translation=web`)
          .then(res => res.json())
          .then(data => {
            if (data.verses) {
              setRightVerses(data.verses);
              bibleStorage.saveChapter(selectedBook.id, selectedChapter, 'web', data).catch(() => {});
            }
          })
          .catch(() => {}); // Silent fail for background update
      }
    } catch (err) {
      console.error('Cache check error:', err);
    }
    
    // If not loaded from cache, try to fetch from API
    if (!loadedFromCache) {
      try {
        
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
          Promise.all([
            bibleStorage.saveChapter(selectedBook.id, selectedChapter, 'cuv', cuvData),
            bibleStorage.saveChapter(selectedBook.id, selectedChapter, 'web', engData)
          ]).then(() => {
            // Update offline chapters list
            checkOfflineStatus();
          }).catch(err => console.error('Failed to cache chapter:', err));
        }
      } catch (fetchErr: any) {
        // If online fetch fails, try IndexedDB
        
        try {
          const cachedCuv = await bibleStorage.getChapter(selectedBook.id, selectedChapter, 'cuv');
          const cachedWeb = await bibleStorage.getChapter(selectedBook.id, selectedChapter, 'web');
          
          if (cachedCuv && cachedWeb) {
            setLeftVerses(cachedCuv.verses);
            setRightVerses(cachedWeb.verses);
            setIsOffline(true);
          } else {
            setLeftVerses([]);
            setRightVerses([]);
            // More helpful error message with retry option
            setError(`无法加载 ${selectedBook.name} 第 ${selectedChapter} 章。请检查网络连接。`);
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
    }
  };

  const toggleChineseMode = () => {
    const newMode = !isSimplified;
    setIsSimplified(newMode);
    localStorage.setItem('bibleChineseMode', newMode ? 'simplified' : 'traditional');
  };

  const adjustFontSize = (delta: number) => {
    const newSize = Math.min(Math.max(fontSize + delta, 12), 36);
    setFontSize(newSize);
    localStorage.setItem('bibleFontSize', newSize.toString());
  };

  const processChineseText = (text: string): string => {
    return isSimplified ? toSimplified(text) : text;
  };
  
  // Filter books based on search term
  const filteredBooks = BIBLE_BOOKS.filter(book => 
    book.name.toLowerCase().includes(bookSearchTerm.toLowerCase()) ||
    book.id.toLowerCase().includes(bookSearchTerm.toLowerCase())
  );

  // Calculate estimated time remaining for download
  const calculateTimeRemaining = (progress: number, startTime: number): string => {
    if (progress === 0 || progress === 100) return '';
    
    const elapsed = Date.now() - startTime;
    const estimatedTotal = (elapsed / progress) * 100;
    const remaining = estimatedTotal - elapsed;
    
    if (remaining < 1000) return '即将完成';
    
    const seconds = Math.floor(remaining / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `约 ${hours} 小时 ${minutes % 60} 分钟`;
    } else if (minutes > 0) {
      return `约 ${minutes} 分钟 ${seconds % 60} 秒`;
    } else {
      return `约 ${seconds} 秒`;
    }
  };

  const handleDownloadCurrentChapter = useCallback(async () => {
    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadStartTime(Date.now());
    setDownloadTimeRemaining('');
    setDownloadStatus(`正在下载: ${selectedBook.name} 第 ${selectedChapter} 章`);
    
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
      alert(`${selectedBook.name} 第 ${selectedChapter} 章已下载！`);
    } catch (err) {
      console.error('Download error:', err);
      alert('下载失败，请检查网络连接后重试。');
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
      setDownloadStatus('');
      setDownloadTimeRemaining('');
      setShowDownloadMenu(false);
    }
  }, [selectedBook, selectedChapter]);

  const handleDownloadCurrentBook = useCallback(async () => {
    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadStartTime(Date.now());
    setDownloadTimeRemaining('');
    
    try {
      const totalChapters = selectedBook.chapters || 1;
      let completed = 0;
      const total = totalChapters * 2; // *2 for both translations
      
      for (let chapter = 1; chapter <= totalChapters; chapter++) {
        // Check if download was cancelled
        if (downloadCancelRef.current) {
          alert('下载已取消');
          return;
        }

        // Update status
        setDownloadStatus(`正在下载: ${selectedBook.name} 第 ${chapter} 章`);

        // Skip if already downloaded
        const hasChapter = await bibleStorage.hasChapter(selectedBook.id, chapter);
        if (hasChapter) {
          completed += 2;
          setDownloadProgress(Math.round((completed / total) * 100));
          continue;
        }

        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Download CUV
        try {
          const cuvRes = await fetch(`https://bible-api.com/${selectedBook.id}${chapter}?translation=cuv`);
          if (cuvRes.ok) {
            const cuvData = await cuvRes.json();
            if (cuvData?.verses) {
              await bibleStorage.saveChapter(selectedBook.id, chapter, 'cuv', cuvData);
            }
          }
        } catch (e) {
          console.error(`Failed to download ${selectedBook.id} ${chapter} CUV:`, e);
        }
        completed++;
        setDownloadProgress(Math.round((completed / total) * 100));

        // Add delay between translations
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Download WEB
        try {
          const webRes = await fetch(`https://bible-api.com/${selectedBook.id}${chapter}?translation=web`);
          if (webRes.ok) {
            const webData = await webRes.json();
            if (webData?.verses) {
              await bibleStorage.saveChapter(selectedBook.id, chapter, 'web', webData);
            }
          }
        } catch (e) {
          console.error(`Failed to download ${selectedBook.id} ${chapter} WEB:`, e);
        }
        completed++;
        setDownloadProgress(Math.round((completed / total) * 100));
      }

      await checkOfflineStatus();
      alert(`${selectedBook.name} 已下载完成！`);
    } catch (err) {
      console.error('Download error:', err);
      alert('下载失败，请检查网络连接后重试。');
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
      setDownloadStatus('');
      setDownloadTimeRemaining('');
      setShowDownloadMenu(false);
    }
  }, [selectedBook]);

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
          // Update download status
          setDownloadStatus(`正在下载: ${book.name} 第 ${chapter} 章`);
          
          // Add longer rate limiting delay between requests (2 seconds)
          await new Promise(resolve => setTimeout(resolve, 2000));
          
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
                // Rate limited - wait much longer
                const waitTime = (5 + retry * 5);
                await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
              } else if (retry < 2) {
                await new Promise(resolve => setTimeout(resolve, 2000));
              }
            } catch (e) {
              if (retry === 2) {
                console.error(`Failed to download ${book.id} ${chapter} CUV after retries:`, e);
                break; // Don't throw, just skip this chapter
              }
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
          }
          if (!cuvSuccess) {
            failedChapters.push(`${book.id} ${chapter} CUV`);
          }
          completed++;
          setDownloadProgress(Math.round((completed / total) * 100));
          
          // Add delay between translations too (2 seconds)
          await new Promise(resolve => setTimeout(resolve, 2000));
          
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
                // Rate limited - wait much longer
                const waitTime = (5 + retry * 5);
                await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
              } else if (retry < 2) {
                await new Promise(resolve => setTimeout(resolve, 2000));
              }
            } catch (e) {
              if (retry === 2) {
                console.error(`Failed to download ${book.id} ${chapter} WEB after retries:`, e);
                break; // Don't throw, just skip this chapter
              }
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
          }
          if (!webSuccess) {
            failedChapters.push(`${book.id} ${chapter} WEB`);
          }
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

  const handleDownloadBible = useCallback(async () => {
    // Warn user about download time due to rate limiting
    if (!confirm('下载整本圣经需要较长时间（约30-60分钟）以避免服务器限制。是否继续？\n\nDownloading the entire Bible will take 30-60 minutes to avoid server rate limits. Continue?')) {
      return;
    }
    
    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadStartTime(Date.now());
    setDownloadTimeRemaining('');
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
      setDownloadStatus('');
      setShowDownloadMenu(false);
      await checkOfflineStatus();
    }
  }, []);

  const handleAutoDownloadBible = async () => {
    if (autoDownloadInProgress) return;
    
    setAutoDownloadInProgress(true);
    setDownloadProgress(0);
    setDownloadStartTime(Date.now());
    setDownloadTimeRemaining('');
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
      setDownloadStatus('');
      setDownloadTimeRemaining('');
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
      setDownloadStatus('');
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

    // Add "解读:" prefix for research
    const textToSend = fullText && !manualText 
      ? `解读: ${fullText}` 
      : fullText;
    
    onVersesSelectedForChat(textToSend);
  }, [selectedBook, selectedChapter, leftVerses, rightVerses, onSelectionChange, onVersesSelectedForChat]);

  const handleVerseClick = (verseNum: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    // Don't respond to verse clicks if there's already text selection
    // (text selection takes priority over verse selection on all platforms)
    
    // If there's text selection, don't handle the click
    const selection = window.getSelection()?.toString();
    if (selection && selection.length > 0) return;

    // Toggle verse selection - deselect if already selected, select if not
    // Clear any text selection when clicking a verse
    window.getSelection()?.removeAllRanges();
    
    const isCurrentlySelected = selectedVerses.includes(verseNum);
    const newSelection = isCurrentlySelected ? [] : [verseNum];
    setSelectedVerses(newSelection);
    notifySelection(newSelection);
  };

  const handleEmptySpaceClick = (e: React.MouseEvent) => {
    // Don't select all verses in research mode (text selection preferred)
    return;
    
    const selection = window.getSelection()?.toString();
    if (selection && selection.length > 0) return;

    const allVerses = leftVerses.map(v => v.verse);
    setSelectedVerses(allVerses);
    notifySelection(allVerses);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    // Skip on iOS - use touch events instead for two-step selection
    if (isIOS) return;
    
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text && text.length > 0) {
      // Don't notify selection here - let handleTextSelection determine the correct verse
      // Only show the context menu
      handleTextSelection();
    }
  };

  // iOS-only touch handler for two-step text selection
  const handleIOSTouchEnd = (e: React.TouchEvent) => {
    if (!isIOS) return;
    
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    
    if (text && text.length > 0) {
      if (!iosTextSelectionReady) {
        // First selection - just mark as ready, don't show context menu
        setIosTextSelectionReady(true);
      } else {
        // Second tap on selected text - show context menu
        handleTextSelection();
        setIosTextSelectionReady(false);
      }
    } else {
      // No text selected - reset state
      setIosTextSelectionReady(false);
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

  const resize = useCallback((e: MouseEvent | TouchEvent) => {
    if (isResizing && panelContainerRef.current) {
      const rect = panelContainerRef.current.getBoundingClientRect();
      const clientX = 'clientX' in e ? e.clientX : e.touches[0]?.clientX || 0;
      const percentage = ((clientX - rect.left) / rect.width) * 100;
      if (percentage >= 0 && percentage <= 100) {
        setVSplitOffset(percentage);
      }
    }
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
      window.addEventListener('touchmove', resize);
      window.addEventListener('touchend', stopResizing);
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      window.removeEventListener('touchmove', resize);
      window.removeEventListener('touchend', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      window.removeEventListener('touchmove', resize);
      window.removeEventListener('touchend', stopResizing);
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

  // Handler for selecting chapter from history
  const handleSelectFromHistory = (bookId: string, chapter: number) => {
    const book = BIBLE_BOOKS.find(b => b.id === bookId);
    if (book) {
      setSelectedBook(book);
      setSelectedChapter(chapter);
      setSelectedVerses([]);
    }
  };

  // Handle text selection for context menu
  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const selectedText = selection.toString();
      
      // Find which verse element contains the selection by checking the DOM
      let verseInfo = undefined;
      
      // Get the container element of the selection's anchor node
      let containerElement = selection.anchorNode?.parentElement;
      
      // Traverse up the DOM tree to find the verse container div with data-verse attribute
      let traversalDepth = 0;
      while (containerElement && !containerElement.hasAttribute('data-verse') && traversalDepth < 10) {
        containerElement = containerElement.parentElement;
        traversalDepth++;
      }
      
      
      // If we found a verse container, extract the verse number from its data-verse attribute
      if (containerElement && containerElement.hasAttribute('data-verse')) {
        const verseNum = parseInt(containerElement.getAttribute('data-verse') || '0');
        
        if (verseNum > 0) {
          // Find the verse data
          const allVerses = [...leftVerses, ...rightVerses];
          const verseData = allVerses.find(v => v.verse === verseNum);
          
          if (verseData) {
            verseInfo = {
              bookId: selectedBook.id,
              bookName: selectedBook.name,
              chapter: selectedChapter,
              verseNum: verseData.verse,
              fullVerseText: verseData.text
            };
          } else {
          }
        }
      } else {
      }
      
      // Fallback: if we couldn't find it by DOM, search by text (but this may get the wrong verse)
      if (!verseInfo) {
        const allVerses = [...leftVerses, ...rightVerses];
        for (const verse of allVerses) {
          const cleanVerseText = verse.text.replace(/\s+/g, ' ').trim();
          const cleanSelectedText = selectedText.replace(/\s+/g, ' ').trim();
          
          if (cleanVerseText.includes(cleanSelectedText)) {
            verseInfo = {
              bookId: selectedBook.id,
              bookName: selectedBook.name,
              chapter: selectedChapter,
              verseNum: verse.verse,
              fullVerseText: verse.text
            };
            break;
          }
        }
      }
      
      // Clear any existing verse selection first (text selection takes priority)
      setSelectedVerses([]);
      
      // If we have verse info and not on iOS, highlight just that verse
      // On iOS, avoid verse selection to prevent interference with page flipping
      if (verseInfo && !isIOS) {
        setSelectedVerses([verseInfo.verseNum]);
      }
      
      // Show context menu with the selected text and verse info
      setContextMenu({
        position: {
          x: rect.left + window.scrollX,
          y: rect.bottom + window.scrollY
        },
        selectedText: selectedText,
        verseInfo: verseInfo
      });
    } else {
      setContextMenu(null);
    }
  };

  // Context menu actions
  const handleContextMenuAction = (action: 'research' | 'note' | 'copy') => {
    if (!contextMenu) return;
    
    switch (action) {
      case 'research':
        // Save the selected text and verse info before clearing
        const selectedText = contextMenu.selectedText;
        const verseInfo = contextMenu.verseInfo;
        
        // If we have verse info, select that verse
        if (verseInfo) {
          setSelectedVerses([verseInfo.verseNum]);
        } else {
          // Clear verse selection if we couldn't find the verse
          setSelectedVerses([]);
        }
        
        // Immediately clear ALL text selections to prevent any expansion
        window.getSelection()?.removeAllRanges();
        document.getSelection()?.removeAllRanges();
        
        // Close context menu first
        setContextMenu(null);
        
        // Format the selected text with context
        const formattedText = verseInfo 
          ? `解读："${selectedText}" in ${verseInfo.bookName} ${verseInfo.chapter}:${verseInfo.verseNum}\n\n完整经文：${verseInfo.fullVerseText}`
          : `解读："${selectedText}"`;
        
        // Send to AI chat - don't clear previous chat
        onVersesSelectedForChat(formattedText, false);
        
        // Adjust layout: horizontal divider to 50%, research view to 100%
        if (onLayoutChange) {
          onLayoutChange(50, 100);
        }
        
        break;
      case 'note':
        // Use verse info from context menu
        const noteVerseInfo = contextMenu.verseInfo;
        const noteSelectedText = contextMenu.selectedText;
        
        
        // If we have verse info, use it directly
        const versesToUse = noteVerseInfo 
          ? [noteVerseInfo.verseNum]
          : selectedVerses.length > 0 ? selectedVerses : [];
        
        if (versesToUse.length > 0 || noteVerseInfo) {
          // Set the selected verses for visual feedback
          if (noteVerseInfo) {
            setSelectedVerses([noteVerseInfo.verseNum]);
          } else if (versesToUse.length > 0) {
            setSelectedVerses(versesToUse);
          }
          
          const noteId = noteVerseInfo
            ? `${noteVerseInfo.bookId}:${noteVerseInfo.chapter}:${noteVerseInfo.verseNum}`
            : `${selectedBook.id}:${selectedChapter}:${versesToUse[0]}`;
            
          
          onSelectionChange?.({
            id: noteId,
            bookId: noteVerseInfo?.bookId || selectedBook.id,
            bookName: noteVerseInfo?.bookName || selectedBook.name,
            chapter: noteVerseInfo?.chapter || selectedChapter,
            verseNums: noteVerseInfo ? [noteVerseInfo.verseNum] : versesToUse,
            selectedRawText: noteSelectedText
          });
          
          // Clear text selection but keep verse selection
          window.getSelection()?.removeAllRanges();
          document.getSelection()?.removeAllRanges();
          
          // No mode switching needed anymore
        }
        break;
      case 'copy':
        navigator.clipboard.writeText(contextMenu.selectedText);
        break;
    }
    
    // Close context menu
    setContextMenu(null);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    // Enable page flip on iOS
    if (isIOS) {
      // Don't start swipe if user is selecting text
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) return;
      
      // Don't start swipe if verses are selected (user might be trying to copy)
      if (selectedVerses.length > 0) return;
      
      // Allow swiping from anywhere on the screen
      // Store the starting position for swipe detection
      setTouchStartX(e.touches[0].clientX);
      setTouchStartY(e.touches[0].clientY);
      setSwipeDirection(null); // Reset swipe direction detection
      setIsSwiping(false);
      setSwipeOffset(0);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX === null || touchStartY === null) return;
    
    // Stop if text is being selected
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      setTouchStartX(null);
      setTouchStartY(null);
      setSwipeDirection(null);
      setIsSwiping(false);
      setSwipeOffset(0);
      return;
    }
    
    // Stop if verses are selected
    if (selectedVerses.length > 0) {
      setTouchStartX(null);
      setTouchStartY(null);
      setSwipeDirection(null);
      setIsSwiping(false);
      setSwipeOffset(0);
      return;
    }
    
    const horizontalDiff = e.touches[0].clientX - touchStartX;
    const verticalDiff = e.touches[0].clientY - touchStartY;
    
    // Determine swipe direction on first significant movement
    if (swipeDirection === null) {
      const absHorizontal = Math.abs(horizontalDiff);
      const absVertical = Math.abs(verticalDiff);
      
      // Need minimum movement to determine direction
      if (absHorizontal > 10 || absVertical > 10) {
        // Check if swipe is more horizontal than vertical (within 30-degree angle)
        if (absHorizontal > absVertical * 1.5) {
          setSwipeDirection('horizontal');
        } else {
          setSwipeDirection('vertical');
          // Cancel any page flip for vertical swipes
          setTouchStartX(null);
          setTouchStartY(null);
          setIsSwiping(false);
          setSwipeOffset(0);
          return;
        }
      }
    }
    
    // Only process horizontal swipes
    if (swipeDirection === 'horizontal') {
      setIsSwiping(true);
      // Update swipe offset for visual feedback
      setSwipeOffset(horizontalDiff);
      setFlipDirection(horizontalDiff > 0 ? 'right' : 'left');
      
      // Prevent vertical scrolling while swiping horizontally
      e.preventDefault();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null || !isSwiping || swipeDirection !== 'horizontal') {
      // Reset all states
      setTouchStartX(null);
      setTouchStartY(null);
      setSwipeDirection(null);
      setIsSwiping(false);
      setSwipeOffset(0);
      return;
    }
    const diff = e.changedTouches[0].clientX - touchStartX;
    
    // Determine if we should complete the flip based on distance
    const shouldFlip = Math.abs(diff) > window.innerWidth * 0.25; // 25% of screen width
    
    if (shouldFlip) {
      // Animate to completion
      setIsPageFlipping(true);
      const targetOffset = diff > 0 ? window.innerWidth : -window.innerWidth;
      setSwipeOffset(targetOffset);
      
      // Navigate after animation
      setTimeout(() => {
        navigateChapter(diff > 0 ? 'prev' : 'next');
        setSwipeOffset(0);
        setIsPageFlipping(false);
        setFlipDirection(null);
        setIsSwiping(false);
      }, 300);
    } else {
      // Snap back
      setIsPageFlipping(true);
      setSwipeOffset(0);
      setTimeout(() => {
        setIsPageFlipping(false);
        setFlipDirection(null);
        setIsSwiping(false);
      }, 300);
    }
    
    setTouchStartX(null);
    setTouchStartY(null);
    setSwipeDirection(null);
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
      onDownloadFunctionsReady(handleDownloadBible, handleDownloadCurrentChapter, handleDownloadCurrentBook);
    }
  }, [handleDownloadBible, handleDownloadCurrentChapter, handleDownloadCurrentBook, onDownloadFunctionsReady]);

  // Calculate time remaining whenever progress updates
  useEffect(() => {
    if ((isDownloading || autoDownloadInProgress) && downloadStartTime > 0 && downloadProgress > 0) {
      const timeRemaining = calculateTimeRemaining(downloadProgress, downloadStartTime);
      setDownloadTimeRemaining(timeRemaining);
    }
  }, [downloadProgress, downloadStartTime, isDownloading, autoDownloadInProgress]);

  // Notify parent of download state changes
  useEffect(() => {
    if (onDownloadStateChange) {
      onDownloadStateChange(isDownloading || autoDownloadInProgress, downloadProgress, downloadStatus, downloadTimeRemaining);
    }
  }, [isDownloading, autoDownloadInProgress, downloadProgress, downloadStatus, downloadTimeRemaining, onDownloadStateChange]);

  return (
    <div 
      className={`h-full flex flex-col bg-white overflow-hidden ${isTransitioning ? 'select-none' : ''}`}
      ref={containerRef} 
      onClick={handleEmptySpaceClick}
      onMouseUp={handleMouseUp}
      onTouchEnd={isIOS ? handleIOSTouchEnd : undefined}
      style={{
        userSelect: isTransitioning ? 'none' : 'auto',
        WebkitUserSelect: isTransitioning ? 'none' : 'auto'
      }}
    >
      <div className={`flex items-center justify-between px-3 py-2 border-b bg-slate-50 sticky top-0 z-10 shrink-0 shadow-sm ${isIPhone ? 'gap-2' : ''}`} onClick={e => e.stopPropagation()}>
        <div className={`flex ${isIPhone ? 'gap-1' : 'gap-3'} items-center`}>
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
          {!isIPhone && <div className="h-6 w-[1px] bg-slate-300"></div>}
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
          <div className="relative" ref={bookSearchRef}>
            <input
              type="text"
              className={`p-1.5 rounded border bg-white text-sm focus:ring-2 focus:ring-indigo-500 font-medium ${isIPhone ? 'w-24' : 'w-40'}`}
              value={showBookDropdown ? bookSearchTerm : selectedBook.name}
              onChange={(e) => setBookSearchTerm(e.target.value)}
              onFocus={() => {
                setShowBookDropdown(true);
                setBookSearchTerm('');
              }}
              placeholder="搜索书卷..."
            />
            {showBookDropdown && (
              <div className="absolute top-full mt-1 w-full max-h-60 overflow-y-scroll bg-white border border-slate-200 rounded-lg shadow-lg z-50 book-dropdown-scroll">
                {filteredBooks.length > 0 ? (
                  filteredBooks.map(book => (
                    <button
                      key={book.id}
                      onClick={() => {
                        setSelectedBook(book);
                        setSelectedChapter(1);
                        setShowBookDropdown(false);
                        setBookSearchTerm('');
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 transition-colors ${
                        book.id === selectedBook.id ? 'bg-indigo-100 font-semibold' : ''
                      }`}
                    >
                      {book.name}
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-2 text-sm text-slate-500">没有找到匹配的书卷</div>
                )}
              </div>
            )}
          </div>
          <select 
            className={`p-1.5 rounded border bg-white text-sm focus:ring-2 focus:ring-indigo-500 font-medium ${isIPhone ? 'w-16' : 'w-24'}`}
            value={selectedChapter}
            onChange={(e) => setSelectedChapter(Number(e.target.value))}
          >
            {Array.from({ length: selectedBook.chapters || 1 }, (_, i) => i + 1).map(num => {
              const isOffline = offlineChapters.has(`${selectedBook.id}_${num}`);
              const hasNotes = chaptersWithContent.withNotes.has(num);
              const hasResearch = chaptersWithContent.withResearch.has(num);
              
              let indicators = '';
              if (isOffline) indicators += '✓ ';
              if (hasNotes) indicators += '📝 ';
              if (hasResearch) indicators += '🤖 ';
              
              return (
                <option key={num} value={num}>
                  {indicators}{isIPhone ? num : `第 ${num} 章`}
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
        <div className={`flex items-center ${isIPhone ? 'gap-1' : 'gap-3'}`}>
          {/* Reading History Button */}
          <button
            onClick={() => setShowReadingHistory(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border border-slate-200 hover:border-indigo-300 transition-colors shadow-sm"
            title="阅读历史"
          >
            <span className="text-sm">📚</span>
            {!isIPhone && <span className="text-xs font-medium text-slate-600">历史</span>}
          </button>
          
          {!isIPhone && (
            <button
              onClick={toggleChineseMode}
              className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border border-slate-200 hover:border-indigo-300 transition-colors shadow-sm"
              title="切换简繁体"
            >
              <span className="text-xs font-medium text-slate-600">{isSimplified ? '简' : '繁'}</span>
            </button>
          )}
          <div className="flex items-center gap-1 px-2 py-1 bg-white rounded-full border border-slate-200 shadow-sm">
            <button
              onClick={() => adjustFontSize(-2)}
              className="p-0.5 hover:bg-slate-100 rounded transition-colors"
              title="缩小字体"
              disabled={fontSize <= 12}
            >
              <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>
            <span className="text-xs font-medium text-slate-600 px-1 min-w-[20px] text-center">{fontSize}</span>
            <button
              onClick={() => adjustFontSize(2)}
              className="p-0.5 hover:bg-slate-100 rounded transition-colors"
              title="放大字体"
              disabled={fontSize >= 36}
            >
              <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
          {(isDownloading || autoDownloadInProgress) && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  downloadCancelRef.current = true;
                  setIsDownloading(false);
                  setAutoDownloadInProgress(false);
                  setDownloadStatus('');
                  setDownloadTimeRemaining('');
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
                <div className="flex flex-col items-start">
                  <span className="text-xs font-medium text-slate-600">
                    {autoDownloadInProgress ? '自动 ' : ''}{downloadProgress}%
                    {downloadTimeRemaining && ` • ${downloadTimeRemaining}`}
                  </span>
                  {downloadStatus && (
                    <span className="text-[10px] text-slate-500">
                      {downloadStatus}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden lg:block">
            {selectedVerses.length === leftVerses.length && leftVerses.length > 0 ? '已选全章' : (selectedVerses.length > 0 ? `已选 ${selectedVerses.length} 节` : '点击经文或高亮文字')}
          </div>
          <div className="h-4 w-[1px] bg-slate-200 hidden lg:block"></div>
          
          {/* Mobile Menu Button for iPhone */}
          {isIPhone && (
            <div className="relative" ref={mobileMenuRef}>
              <button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="p-1.5 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
                title="更多选项"
              >
                <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
              </button>
              
              {showMobileMenu && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 z-50">
                  
                  {/* Chinese Mode Toggle */}
                  <button
                    onClick={() => {
                      toggleChineseMode();
                      setShowMobileMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 transition-colors"
                  >
                    <span className="text-slate-700">切换简繁体</span>
                    <span className="float-right text-slate-500">{isSimplified ? '简' : '繁'}</span>
                  </button>
                </div>
              )}
            </div>
          )}
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
        {/* Show next/previous page during swipe */}
        {isIOS && isSwiping && flipDirection && (
          <div 
            className="absolute inset-0 overflow-y-auto p-4 md:p-6 space-y-0.5 font-serif-sc"
            style={{
              transform: flipDirection === 'left' 
                ? `translateX(${window.innerWidth + swipeOffset}px)`
                : `translateX(${-window.innerWidth + swipeOffset}px)`,
              transition: isPageFlipping ? 'transform 0.3s ease-out' : 'none',
              zIndex: 5,
              backgroundColor: '#FDF8F0',
              boxShadow: '0 0 20px rgba(0,0,0,0.1)'
            }}
          >
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">和合本 CUV</div>
            {(flipDirection === 'left' ? nextChapterVerses : prevChapterVerses).map((v: Verse) => (
              <div key={`preview-${v.verse}`} data-verse={v.verse} className="p-1 rounded-lg border-transparent">
                <span className="font-bold mr-3 text-xs" style={{ color: '#8B7355' }}>{v.verse}</span>
                <span className="leading-relaxed" style={{ 
                  fontSize: `${fontSize}px`,
                  color: '#3A3028'
                }}>{processChineseText(v.text)}</span>
                <VerseIndicators
                  hasNote={verseData[`${selectedBook.id}:${selectedChapter}:${v.verse}`]?.hasNote || false}
                  hasResearch={verseData[`${selectedBook.id}:${selectedChapter}:${v.verse}`]?.hasResearch || false}
                  notePreview={verseData[`${selectedBook.id}:${selectedChapter}:${v.verse}`]?.notePreview}
                  researchCount={verseData[`${selectedBook.id}:${selectedChapter}:${v.verse}`]?.researchCount || 0}
                  onClick={() => {
                    const noteId = `${selectedBook.id}:${selectedChapter}:${v.verse}`;
                    
                    // Select this verse first
                    setSelectedVerses([v.verse]);
                    
                    // Create the selection object
                    const selectionInfo = {
                      id: noteId,
                      bookId: selectedBook.id,
                      bookName: selectedBook.name,
                      chapter: selectedChapter,
                      verseNums: [v.verse],
                      selectedRawText: v.text
                    };
                    
                    
                    // Notify the parent about the selection
                    onSelectionChange?.(selectionInfo);
                    
                  }}
                />
              </div>
            ))}
          </div>
        )}
        <div 
          ref={leftScrollRef}
          onScroll={() => handleScroll('left')}
          className="overflow-y-auto p-4 md:p-6 space-y-0.5 font-serif-sc border-r border-slate-100"
          style={{ 
            flexGrow: vSplitOffset >= 100 ? 1 : 0,
            flexShrink: vSplitOffset >= 100 ? 1 : 0,
            flexBasis: vSplitOffset >= 100 ? 'calc(100% - 20px)' : vSplitOffset <= 0 ? '0%' : `calc(${vSplitOffset}% - 10px)`,
            minWidth: 0,
            display: vSplitOffset <= 0 ? 'none' : 'block',
            // Paper-like background always applied
            backgroundColor: '#FDF8F0',
            backgroundImage: `
              linear-gradient(180deg, #FFFEF9 0%, #FDF6E8 50%, #FAF3E5 100%),
              radial-gradient(ellipse at top left, rgba(252, 243, 223, 0.4) 0%, transparent 50%),
              radial-gradient(ellipse at bottom right, rgba(249, 235, 195, 0.3) 0%, transparent 50%)
            `,
            boxShadow: `
              inset 0 0 60px rgba(245, 225, 185, 0.25),
              inset 0 0 30px rgba(249, 235, 195, 0.15),
              inset 2px 2px 5px rgba(0, 0, 0, 0.02)
            `,
            position: 'relative' as const,
            // Simple page slide animation for iOS
            ...(isIOS && {
              transform: `translateX(${swipeOffset}px)`,
              transition: isPageFlipping ? 'transform 0.3s ease-out' : 'none',
              willChange: isSwiping ? 'transform' : 'auto'
            })
          }}
        >
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">和合本 CUV</div>
          {loading ? (
            <div className="animate-pulse space-y-2">
              {[1,2,3,4,5].map(n => <div key={n} className="h-4 bg-slate-100 rounded w-full"></div>)}
            </div>
          ) : (
            leftVerses.map(v => (
              <div 
                key={`left-${v.verse}`}
                data-verse={v.verse}
                onClick={(e) => handleVerseClick(v.verse, e)}
                className={`p-1 rounded-lg transition-all border relative ${
                  selectedVerses.includes(v.verse) ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 
                  'border-transparent hover:bg-slate-50'
                }`}
                style={{ 
                  cursor: 'default',
                  userSelect: 'text'
                }}
              >
                <span className="font-bold mr-3 text-xs" style={{ color: '#8B7355' }}>{v.verse}</span>
                <span className="leading-relaxed" style={{ 
                  fontSize: `${fontSize}px`,
                  color: '#3A3028'
                }}>{processChineseText(v.text)}</span>
                <VerseIndicators
                  hasNote={verseData[`${selectedBook.id}:${selectedChapter}:${v.verse}`]?.hasNote || false}
                  hasResearch={verseData[`${selectedBook.id}:${selectedChapter}:${v.verse}`]?.hasResearch || false}
                  notePreview={verseData[`${selectedBook.id}:${selectedChapter}:${v.verse}`]?.notePreview}
                  researchCount={verseData[`${selectedBook.id}:${selectedChapter}:${v.verse}`]?.researchCount || 0}
                  onClick={() => {
                    const noteId = `${selectedBook.id}:${selectedChapter}:${v.verse}`;
                    
                    // Select this verse first
                    setSelectedVerses([v.verse]);
                    
                    // Create the selection object
                    const selectionInfo = {
                      id: noteId,
                      bookId: selectedBook.id,
                      bookName: selectedBook.name,
                      chapter: selectedChapter,
                      verseNums: [v.verse],
                      selectedRawText: v.text
                    };
                    
                    
                    // Notify the parent about the selection
                    onSelectionChange?.(selectionInfo);
                    
                  }}
                />
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
            display: 'flex'
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
            onTouchStart={startResizing}
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
          className="overflow-y-auto p-4 md:p-6 space-y-0.5 font-sans"
          style={{ 
            flexGrow: vSplitOffset <= 0 ? 1 : 0,
            flexShrink: vSplitOffset <= 0 ? 1 : 0,
            flexBasis: vSplitOffset <= 0 ? 'calc(100% - 20px)' : vSplitOffset >= 100 ? '0%' : `calc(${100 - vSplitOffset}% - 10px)`,
            minWidth: 0,
            display: vSplitOffset >= 100 ? 'none' : 'block',
            // Paper-like background always applied for English panel
            backgroundColor: '#FDF8F0',
            backgroundImage: `
              linear-gradient(180deg, #FFFEF9 0%, #FDF6E8 50%, #FAF3E5 100%),
              radial-gradient(ellipse at top right, rgba(252, 243, 223, 0.4) 0%, transparent 50%),
              radial-gradient(ellipse at bottom left, rgba(249, 235, 195, 0.3) 0%, transparent 50%)
            `,
            boxShadow: `
              inset 0 0 60px rgba(245, 225, 185, 0.25),
              inset 0 0 30px rgba(249, 235, 195, 0.15),
              inset -2px 2px 5px rgba(0, 0, 0, 0.02)
            `,
            position: 'relative' as const
          }}
        >
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">English (WEB)</div>
          {loading ? (
            <div className="animate-pulse space-y-2">
              {[1,2,3,4,5].map(n => <div key={n} className="h-4 bg-slate-100 rounded w-full"></div>)}
            </div>
          ) : (
            rightVerses.map(v => (
              <div 
                key={`right-${v.verse}`}
                data-verse={v.verse}
                onClick={(e) => handleVerseClick(v.verse, e)}
                className={`p-1 rounded-lg transition-all border ${
                  selectedVerses.includes(v.verse) ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 
                  'border-transparent hover:bg-slate-50'
                }`}
                style={{ 
                  cursor: 'default',
                  userSelect: 'text'
                }}
              >
                <span className="text-indigo-400 font-bold mr-3 text-xs">{v.verse}</span>
                <span className="leading-relaxed text-slate-700 italic" style={{ fontSize: `${fontSize}px` }}>{v.text}</span>
              </div>
            ))
          )}
        </div>
      </div>
      
      {/* Non-blocking error notification */}
      {error && (
        <div className="absolute bottom-4 right-4 bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in slide-in-from-bottom-2 max-w-md">
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            <span className="text-sm block">{error}</span>
            <button 
              onClick={() => {
                setError(null);
                fetchChapter(); // Retry loading
              }}
              className="text-xs mt-1 underline hover:no-underline"
            >
              点击重试
            </button>
          </div>
          <button onClick={() => setError(null)} className="ml-2 hover:text-red-100 shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      
      {/* Reading History Modal */}
      {showReadingHistory && (
        <ReadingHistory
          onSelectChapter={handleSelectFromHistory}
          onClose={() => setShowReadingHistory(false)}
        />
      )}
      
      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          position={contextMenu.position}
          selectedText={contextMenu.selectedText}
          onResearch={() => handleContextMenuAction('research')}
          onAddNote={() => handleContextMenuAction('note')}
          onCopy={() => handleContextMenuAction('copy')}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};

export default BibleViewer;
