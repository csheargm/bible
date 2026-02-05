/**
 * annotationStorage.ts
 * 
 * IndexedDB storage service for Bible annotation data.
 * Stores per-chapter canvas drawing data (serialized paths) and expanded canvas height.
 * Uses the `idb` library for clean async IndexedDB access.
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';

/** Serialized annotation data for a single chapter */
export interface AnnotationRecord {
  /** Composite key: "bookId:chapter" */
  id: string;
  bookId: string;
  chapter: number;
  /** JSON-serialized array of drawing paths */
  canvasData: string;
  /** Extra expanded height in pixels (0 = no expansion) */
  canvasHeight: number;
  /** Timestamp of last modification */
  lastModified: number;
}

interface AnnotationDB extends DBSchema {
  annotations: {
    key: string;
    value: AnnotationRecord;
    indexes: {
      'by-book': string;
      'by-modified': number;
    };
  };
}

class AnnotationStorageService {
  private dbPromise: Promise<IDBPDatabase<AnnotationDB>>;

  constructor() {
    this.dbPromise = openDB<AnnotationDB>('BibleAnnotationsDB', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('annotations')) {
          const store = db.createObjectStore('annotations', { keyPath: 'id' });
          store.createIndex('by-book', 'bookId');
          store.createIndex('by-modified', 'lastModified');
        }
      },
    });
  }

  /**
   * Save annotation data for a specific book+chapter.
   * Creates or overwrites existing annotation.
   */
  async saveAnnotation(
    bookId: string,
    chapter: number,
    canvasData: string,
    canvasHeight: number
  ): Promise<void> {
    try {
      const db = await this.dbPromise;
      const id = `${bookId}:${chapter}`;
      await db.put('annotations', {
        id,
        bookId,
        chapter,
        canvasData,
        canvasHeight,
        lastModified: Date.now(),
      });
    } catch (error) {
      console.error('Failed to save annotation:', error);
      throw error;
    }
  }

  /**
   * Retrieve annotation data for a specific book+chapter.
   * Returns null if no annotation exists.
   */
  async getAnnotation(
    bookId: string,
    chapter: number
  ): Promise<{ data: string; height: number } | null> {
    try {
      const db = await this.dbPromise;
      const id = `${bookId}:${chapter}`;
      const record = await db.get('annotations', id);
      if (!record) return null;
      return {
        data: record.canvasData,
        height: record.canvasHeight,
      };
    } catch (error) {
      console.error('Failed to get annotation:', error);
      return null;
    }
  }

  /**
   * Delete annotation data for a specific book+chapter.
   */
  async deleteAnnotation(bookId: string, chapter: number): Promise<void> {
    try {
      const db = await this.dbPromise;
      const id = `${bookId}:${chapter}`;
      await db.delete('annotations', id);
    } catch (error) {
      console.error('Failed to delete annotation:', error);
      throw error;
    }
  }

  /**
   * Get all annotations for a given book (for checking which chapters have annotations).
   */
  async getAnnotationsForBook(bookId: string): Promise<AnnotationRecord[]> {
    try {
      const db = await this.dbPromise;
      return await db.getAllFromIndex('annotations', 'by-book', bookId);
    } catch (error) {
      console.error('Failed to get annotations for book:', error);
      return [];
    }
  }
}

export const annotationStorage = new AnnotationStorageService();
