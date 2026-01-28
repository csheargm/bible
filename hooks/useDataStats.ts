import { useState, useEffect } from 'react';
import { verseDataStorage } from '../services/verseDataStorage';
import { bibleStorage } from '../services/bibleStorage';

export interface DataStats {
  personalNotes: number;
  aiResearch: number;
  cachedChapters: number;
  totalSize?: number;
}

export function useDataStats(updateTrigger?: number) {
  const [stats, setStats] = useState<DataStats>({
    personalNotes: 0,
    aiResearch: 0,
    cachedChapters: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        
        // Get verse data counts
        const allVerseData = await verseDataStorage.getAllData();
        const personalNotes = allVerseData.filter(v => v.personalNote).length;
        const aiResearch = allVerseData.reduce((acc, v) => acc + v.aiResearch.length, 0);
        
        // Get cached chapters count
        let cachedChapters = 0;
        try {
          const chapters = await bibleStorage.getAllChapters();
          // Count unique book-chapter combinations (not counting translations separately)
          const uniqueChapters = new Set(
            chapters.map(ch => `${ch.bookId}_${ch.chapter}`)
          );
          cachedChapters = uniqueChapters.size;
        } catch (e) {
          console.warn('Could not get cached chapters:', e);
        }
        
        // Get storage size if available
        let totalSize;
        try {
          const storageInfo = await bibleStorage.getStorageInfo();
          if (storageInfo.used) {
            totalSize = storageInfo.used;
          }
        } catch (e) {
          console.warn('Could not get storage info:', e);
        }
        
        setStats({
          personalNotes,
          aiResearch,
          cachedChapters,
          totalSize
        });
      } catch (error) {
        console.error('Failed to fetch data stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [updateTrigger]);

  return { stats, loading };
}