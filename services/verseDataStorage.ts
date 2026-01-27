import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { VerseData, PersonalNote, AIResearchEntry } from '../types/verseData';

interface VerseDataDB extends DBSchema {
  verseData: {
    key: string;
    value: VerseData;
    indexes: { 
      'by-book': string;
      'by-chapter': string;
      'by-timestamp': number;
    };
  };
}

class VerseDataStorage {
  private db: IDBPDatabase<VerseDataDB> | null = null;
  private readonly DB_NAME = 'BibleVerseData';
  private readonly VERSION = 1;

  async initialize(): Promise<void> {
    try {
      this.db = await openDB<VerseDataDB>(this.DB_NAME, this.VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('verseData')) {
            const store = db.createObjectStore('verseData', { keyPath: 'id' });
            store.createIndex('by-book', 'bookId');
            store.createIndex('by-chapter', ['bookId', 'chapter']);
            store.createIndex('by-timestamp', 'personalNote.updatedAt');
          }
        },
      });
    } catch (error) {
      console.error('Failed to initialize verse data database:', error);
    }
  }

  private async ensureDB(): Promise<IDBPDatabase<VerseDataDB>> {
    if (!this.db) await this.initialize();
    if (!this.db) throw new Error('Database initialization failed');
    return this.db;
  }

  // Get verse data for a specific verse
  async getVerseData(bookId: string, chapter: number, verses: number[]): Promise<VerseData | null> {
    const db = await this.ensureDB();
    const id = this.createId(bookId, chapter, verses);
    
    console.log('[VerseDataStorage] Getting verse data for:', { id, bookId, chapter, verses });
    
    try {
      const data = await db.get('verseData', id);
      console.log('[VerseDataStorage] Retrieved data:', data);
      return data || null;
    } catch (error) {
      console.error('Failed to get verse data:', error);
      return null;
    }
  }

  // Save or update personal note
  async savePersonalNote(
    bookId: string, 
    chapter: number, 
    verses: number[], 
    note: PersonalNote
  ): Promise<void> {
    const db = await this.ensureDB();
    const id = this.createId(bookId, chapter, verses);
    
    try {
      const existing = await db.get('verseData', id);
      
      const verseData: VerseData = existing || {
        id,
        bookId,
        chapter,
        verses,
        aiResearch: []
      };
      
      verseData.personalNote = {
        ...note,
        updatedAt: Date.now()
      };
      
      await db.put('verseData', verseData);
    } catch (error) {
      console.error('Failed to save personal note:', error);
    }
  }

  // Delete personal note
  async deletePersonalNote(bookId: string, chapter: number, verses: number[]): Promise<void> {
    const db = await this.ensureDB();
    const id = this.createId(bookId, chapter, verses);
    
    try {
      const existing = await db.get('verseData', id);
      if (existing) {
        delete existing.personalNote;
        
        // If no AI research exists either, delete the entire record
        if (existing.aiResearch.length === 0) {
          await db.delete('verseData', id);
        } else {
          await db.put('verseData', existing);
        }
      }
    } catch (error) {
      console.error('Failed to delete personal note:', error);
    }
  }

  // Add AI research entry
  async addAIResearch(
    bookId: string, 
    chapter: number, 
    verses: number[], 
    research: Omit<AIResearchEntry, 'id' | 'timestamp'>
  ): Promise<string> {
    const db = await this.ensureDB();
    const id = this.createId(bookId, chapter, verses);
    const researchId = `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log('[VerseDataStorage] Adding AI research to:', { id, bookId, chapter, verses, research });
    
    try {
      const existing = await db.get('verseData', id);
      console.log('[VerseDataStorage] Existing data:', existing);
      
      const verseData: VerseData = existing || {
        id,
        bookId,
        chapter,
        verses,
        aiResearch: []
      };
      
      const aiEntry: AIResearchEntry = {
        ...research,
        id: researchId,
        timestamp: Date.now()
      };
      
      verseData.aiResearch.push(aiEntry);
      await db.put('verseData', verseData);
      
      console.log('[VerseDataStorage] Saved verse data:', verseData);
      
      return researchId;
    } catch (error) {
      console.error('Failed to add AI research:', error);
      throw error;
    }
  }

  // Delete AI research entry
  async deleteAIResearch(bookId: string, chapter: number, verses: number[], researchId: string): Promise<void> {
    const db = await this.ensureDB();
    const id = this.createId(bookId, chapter, verses);
    
    try {
      const existing = await db.get('verseData', id);
      if (existing) {
        existing.aiResearch = existing.aiResearch.filter(r => r.id !== researchId);
        
        // If no content remains, delete the entire record
        if (!existing.personalNote && existing.aiResearch.length === 0) {
          await db.delete('verseData', id);
        } else {
          await db.put('verseData', existing);
        }
      }
    } catch (error) {
      console.error('Failed to delete AI research:', error);
    }
  }

  // Get all verse data for a chapter
  async getChapterData(bookId: string, chapter: number): Promise<VerseData[]> {
    const db = await this.ensureDB();
    
    try {
      const allData = await db.getAll('verseData');
      return allData.filter(v => v.bookId === bookId && v.chapter === chapter);
    } catch (error) {
      console.error('Failed to get chapter data:', error);
      return [];
    }
  }

  // Get all verse data for a book
  async getBookData(bookId: string): Promise<VerseData[]> {
    const db = await this.ensureDB();
    
    try {
      const index = db.transaction('verseData').store.index('by-book');
      const data = await index.getAll(bookId);
      return data;
    } catch (error) {
      console.error('Failed to get book data:', error);
      return [];
    }
  }

  // Get all verse data
  async getAllData(): Promise<VerseData[]> {
    const db = await this.ensureDB();
    
    try {
      return await db.getAll('verseData');
    } catch (error) {
      console.error('Failed to get all data:', error);
      return [];
    }
  }

  // Search in personal notes
  async searchNotes(query: string): Promise<VerseData[]> {
    const db = await this.ensureDB();
    const results: VerseData[] = [];
    const searchTerm = query.toLowerCase();
    
    try {
      const allData = await db.getAll('verseData');
      
      for (const data of allData) {
        if (data.personalNote?.text && 
            data.personalNote.text.toLowerCase().includes(searchTerm)) {
          results.push(data);
        }
      }
      
      return results;
    } catch (error) {
      console.error('Failed to search notes:', error);
      return [];
    }
  }

  // Search in AI research
  async searchResearch(query: string): Promise<VerseData[]> {
    const db = await this.ensureDB();
    const results: VerseData[] = [];
    const searchTerm = query.toLowerCase();
    
    try {
      const allData = await db.getAll('verseData');
      
      for (const data of allData) {
        const hasMatch = data.aiResearch.some(r => 
          r.query.toLowerCase().includes(searchTerm) ||
          r.response.toLowerCase().includes(searchTerm) ||
          r.tags?.some(tag => tag.toLowerCase().includes(searchTerm))
        );
        
        if (hasMatch) {
          results.push(data);
        }
      }
      
      return results;
    } catch (error) {
      console.error('Failed to search research:', error);
      return [];
    }
  }

  // Migrate from old notes format
  async migrateFromOldNotes(oldNotes: Record<string, string>): Promise<void> {
    const db = await this.ensureDB();
    
    try {
      for (const [key, content] of Object.entries(oldNotes)) {
        // Parse the old key format: "bookId:chapter:verse"
        const parts = key.split(':');
        if (parts.length >= 3) {
          const bookId = parts[0];
          const chapter = parseInt(parts[1]);
          const verses = [parseInt(parts[2])];
          
          // Skip if already migrated
          const existing = await this.getVerseData(bookId, chapter, verses);
          if (existing?.personalNote) continue;
          
          const note: PersonalNote = {
            text: content,
            createdAt: Date.now(),
            updatedAt: Date.now()
          };
          
          await this.savePersonalNote(bookId, chapter, verses, note);
        }
      }
    } catch (error) {
      console.error('Failed to migrate old notes:', error);
    }
  }

  // Clear all data
  async clearAll(): Promise<void> {
    const db = await this.ensureDB();
    
    try {
      await db.clear('verseData');
    } catch (error) {
      console.error('Failed to clear all data:', error);
    }
  }

  // Helper to create consistent IDs
  private createId(bookId: string, chapter: number, verses: number[]): string {
    const versesStr = verses.sort((a, b) => a - b).join('_');
    const id = `${bookId}_${chapter}_${versesStr}`;
    console.log('[VerseDataStorage] Creating ID:', id, { bookId, chapter, verses });
    return id;
  }

  // Export all data for backup
  async exportData(): Promise<VerseData[]> {
    return this.getAllData();
  }

  // Import data from backup
  async importData(data: VerseData[], strategy: 'replace' | 'merge' | 'skip' = 'merge'): Promise<void> {
    const db = await this.ensureDB();
    
    try {
      for (const item of data) {
        const existing = await db.get('verseData', item.id);
        
        if (!existing) {
          // No existing data, just add it
          await db.put('verseData', item);
        } else if (strategy === 'replace') {
          // Replace existing data
          await db.put('verseData', item);
        } else if (strategy === 'merge') {
          // Merge data (combine AI research, keep newer personal note)
          const merged: VerseData = {
            ...existing,
            personalNote: this.mergePersonalNotes(existing.personalNote, item.personalNote),
            aiResearch: this.mergeAIResearch(existing.aiResearch, item.aiResearch)
          };
          await db.put('verseData', merged);
        }
        // 'skip' strategy does nothing if data exists
      }
    } catch (error) {
      console.error('Failed to import data:', error);
      throw error;
    }
  }

  private mergePersonalNotes(existing?: PersonalNote, incoming?: PersonalNote): PersonalNote | undefined {
    if (!existing) return incoming;
    if (!incoming) return existing;
    
    // Keep the newer note
    return existing.updatedAt >= incoming.updatedAt ? existing : incoming;
  }

  private mergeAIResearch(existing: AIResearchEntry[], incoming: AIResearchEntry[]): AIResearchEntry[] {
    const merged = [...existing];
    const existingIds = new Set(existing.map(r => r.id));
    
    // Add new research entries that don't exist
    for (const research of incoming) {
      if (!existingIds.has(research.id)) {
        merged.push(research);
      }
    }
    
    // Sort by timestamp, newest first
    return merged.sort((a, b) => b.timestamp - a.timestamp);
  }
}

export const verseDataStorage = new VerseDataStorage();