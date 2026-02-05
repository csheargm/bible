import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface Bookmark {
  id: string; // format: bookId:chapter:verse
  bookId: string;
  bookName: string;
  chapter: number;
  verse: number;
  textPreview: string; // first ~80 chars of the verse text
  createdAt: number;
}

interface BookmarksDB extends DBSchema {
  bookmarks: {
    key: string;
    value: Bookmark;
    indexes: {
      'by-created': number;
    };
  };
}

class BookmarkStorageService {
  private dbPromise: Promise<IDBPDatabase<BookmarksDB>>;

  constructor() {
    this.dbPromise = openDB<BookmarksDB>('BibleBookmarksDB', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('bookmarks')) {
          const store = db.createObjectStore('bookmarks', { keyPath: 'id' });
          store.createIndex('by-created', 'createdAt');
        }
      },
    });
  }

  async addBookmark(bookmark: Omit<Bookmark, 'createdAt'>): Promise<void> {
    const db = await this.dbPromise;
    await db.put('bookmarks', {
      ...bookmark,
      createdAt: Date.now(),
    });
  }

  async removeBookmark(id: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete('bookmarks', id);
  }

  async isBookmarked(id: string): Promise<boolean> {
    const db = await this.dbPromise;
    const bookmark = await db.get('bookmarks', id);
    return !!bookmark;
  }

  async getAllBookmarks(): Promise<Bookmark[]> {
    const db = await this.dbPromise;
    const all = await db.getAllFromIndex('bookmarks', 'by-created');
    return all.reverse(); // newest first
  }

  async getBookmarkCount(): Promise<number> {
    const db = await this.dbPromise;
    return await db.count('bookmarks');
  }

  async toggleBookmark(bookmark: Omit<Bookmark, 'createdAt'>): Promise<boolean> {
    const exists = await this.isBookmarked(bookmark.id);
    if (exists) {
      await this.removeBookmark(bookmark.id);
      return false; // removed
    } else {
      await this.addBookmark(bookmark);
      return true; // added
    }
  }
}

export const bookmarkStorage = new BookmarkStorageService();
