// Bible Storage Service using IndexedDB for large data storage
const DB_NAME = 'BibleAppDB';
const DB_VERSION = 1;
const STORE_NAME = 'bibleChapters';
const METADATA_STORE = 'metadata';

interface ChapterData {
  id: string;
  bookId: string;
  chapter: number;
  translation: 'cuv' | 'web';
  data: any;
}

class BibleStorageService {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create object store for bible chapters
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('bookChapter', ['bookId', 'chapter', 'translation'], { unique: false });
        }

        // Create metadata store for tracking progress
        if (!db.objectStoreNames.contains(METADATA_STORE)) {
          db.createObjectStore(METADATA_STORE, { keyPath: 'key' });
        }
      };
    });
  }

  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init();
    }
    return this.db!;
  }

  async saveChapter(bookId: string, chapter: number, translation: 'cuv' | 'web', data: any): Promise<void> {
    const db = await this.ensureDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const chapterData: ChapterData = {
      id: `${bookId}_${chapter}_${translation}`,
      bookId,
      chapter,
      translation,
      data
    };

    return new Promise((resolve, reject) => {
      const request = store.put(chapterData);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getChapter(bookId: string, chapter: number, translation: 'cuv' | 'web'): Promise<any | null> {
    const db = await this.ensureDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.get(`${bookId}_${chapter}_${translation}`);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.data : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async hasChapter(bookId: string, chapter: number): Promise<boolean> {
    const cuvData = await this.getChapter(bookId, chapter, 'cuv');
    const webData = await this.getChapter(bookId, chapter, 'web');
    return !!(cuvData && webData);
  }

  async getAllOfflineChapters(): Promise<Set<string>> {
    const db = await this.ensureDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.getAllKeys();
      request.onsuccess = () => {
        const keys = request.result as string[];
        const chapters = new Set<string>();
        
        // Group by bookId_chapter to check if both translations exist
        const chapterMap = new Map<string, Set<string>>();
        
        keys.forEach(key => {
          const parts = key.split('_');
          if (parts.length === 3) {
            const baseKey = `${parts[0]}_${parts[1]}`;
            if (!chapterMap.has(baseKey)) {
              chapterMap.set(baseKey, new Set());
            }
            chapterMap.get(baseKey)!.add(parts[2]);
          }
        });
        
        // Only add to offline set if both translations exist
        chapterMap.forEach((translations, baseKey) => {
          if (translations.has('cuv') && translations.has('web')) {
            chapters.add(baseKey);
          }
        });
        
        resolve(chapters);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveMetadata(key: string, value: any): Promise<void> {
    const db = await this.ensureDB();
    const transaction = db.transaction([METADATA_STORE], 'readwrite');
    const store = transaction.objectStore(METADATA_STORE);
    
    return new Promise((resolve, reject) => {
      const request = store.put({ key, value });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getMetadata(key: string): Promise<any | null> {
    const db = await this.ensureDB();
    const transaction = db.transaction([METADATA_STORE], 'readonly');
    const store = transaction.objectStore(METADATA_STORE);
    
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteMetadata(key: string): Promise<void> {
    const db = await this.ensureDB();
    const transaction = db.transaction([METADATA_STORE], 'readwrite');
    const store = transaction.objectStore(METADATA_STORE);
    
    return new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearAll(): Promise<void> {
    const db = await this.ensureDB();
    const transaction = db.transaction([STORE_NAME, METADATA_STORE], 'readwrite');
    
    return new Promise((resolve, reject) => {
      const chapterStore = transaction.objectStore(STORE_NAME);
      const metadataStore = transaction.objectStore(METADATA_STORE);
      
      const clearChapters = chapterStore.clear();
      const clearMetadata = metadataStore.clear();
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getStorageInfo(): Promise<{ used: number; quota: number }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage || 0,
        quota: estimate.quota || 0
      };
    }
    return { used: 0, quota: 0 };
  }

  // Get all stored chapters for export
  async getAllChapters(): Promise<Array<{
    bookId: string;
    chapter: number;
    translation: 'cuv' | 'web';
    data: any;
  }>> {
    const db = await this.ensureDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const results = request.result || [];
        const chapters = results.map(item => ({
          bookId: item.bookId,
          chapter: item.chapter,
          translation: item.translation,
          data: item.data
        }));
        resolve(chapters);
      };
      request.onerror = () => reject(request.error);
    });
  }
}

export const bibleStorage = new BibleStorageService();