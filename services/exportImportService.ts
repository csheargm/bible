import { verseDataStorage } from './verseDataStorage';
import { VerseData } from '../types/verseData';
import { BIBLE_BOOKS } from '../constants';
import { bibleStorage } from './bibleStorage';

export interface BibleNotesExport {
  version: '1.0';
  exportDate: string;
  deviceId?: string;
  metadata: {
    totalNotes: number;
    totalResearch: number;
    booksIncluded: string[];
  };
  data: {
    [verseId: string]: VerseData;
  };
}

export interface BibleTextExport {
  version: '1.0';
  exportDate: string;
  metadata: {
    totalChapters: number;
    translations: string[];
  };
  chapters: Array<{
    bookId: string;
    chapter: number;
    translation: 'cuv' | 'web';
    data: any;
  }>;
}

export type MergeStrategy = 'replace' | 'merge_newer' | 'merge_combine' | 'skip_existing';

class ExportImportService {
  private deviceId: string;

  constructor() {
    // Generate or retrieve device ID
    this.deviceId = this.getOrCreateDeviceId();
  }

  private getOrCreateDeviceId(): string {
    let id = localStorage.getItem('bible_device_id');
    if (!id) {
      id = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('bible_device_id', id);
    }
    return id;
  }

  // Export all data to JSON format
  async exportToJSON(): Promise<string> {
    const allData = await verseDataStorage.getAllData();
    
    // Calculate metadata
    const metadata = this.calculateMetadata(allData);
    
    // Convert array to object format for easier merging
    const dataObject: { [key: string]: VerseData } = {};
    allData.forEach(item => {
      dataObject[item.id] = item;
    });
    
    const exportData: BibleNotesExport = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      deviceId: this.deviceId,
      metadata,
      data: dataObject
    };
    
    return JSON.stringify(exportData, null, 2);
  }

  // Export to Markdown format
  async exportToMarkdown(): Promise<string> {
    const allData = await verseDataStorage.getAllData();
    let markdown = '# Bible Notes Export\n\n';
    markdown += `**Export Date:** ${new Date().toLocaleDateString()}\n\n`;
    markdown += '---\n\n';
    
    // Group by book
    const groupedByBook = this.groupByBook(allData);
    
    for (const [bookId, verses] of Object.entries(groupedByBook)) {
      const book = BIBLE_BOOKS.find(b => b.id === bookId);
      if (!book) continue;
      
      markdown += `## ${book.name}\n\n`;
      
      // Sort by chapter and verse
      verses.sort((a, b) => {
        if (a.chapter !== b.chapter) return a.chapter - b.chapter;
        return a.verses[0] - b.verses[0];
      });
      
      for (const verse of verses) {
        markdown += `### ${book.name} ${verse.chapter}:${verse.verses.join('-')}\n\n`;
        
        if (verse.personalNote) {
          markdown += '**Personal Note:**\n';
          // Convert HTML to markdown-ish format
          const noteText = this.htmlToMarkdown(verse.personalNote.text);
          markdown += `${noteText}\n\n`;
        }
        
        if (verse.aiResearch.length > 0) {
          markdown += '**AI Research:**\n\n';
          for (const research of verse.aiResearch) {
            markdown += `- **Q:** ${research.query}\n`;
            markdown += `  **A:** ${research.response}\n\n`;
            if (research.tags && research.tags.length > 0) {
              markdown += `  _Tags: ${research.tags.join(', ')}_\n\n`;
            }
          }
        }
        
        markdown += '---\n\n';
      }
    }
    
    return markdown;
  }

  // Export to HTML format
  async exportToHTML(): Promise<string> {
    const allData = await verseDataStorage.getAllData();
    
    let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Bible Notes Export</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #333; }
    h2 { color: #4f46e5; margin-top: 30px; }
    h3 { color: #666; }
    .note { background: #f8f8f8; padding: 15px; border-radius: 8px; margin: 10px 0; }
    .research { background: #e0e7ff; padding: 15px; border-radius: 8px; margin: 10px 0; }
    .tags { color: #666; font-size: 0.9em; font-style: italic; }
    .timestamp { color: #999; font-size: 0.85em; }
  </style>
</head>
<body>
  <h1>Bible Notes Export</h1>
  <p class="timestamp">Export Date: ${new Date().toLocaleDateString()}</p>
`;
    
    const groupedByBook = this.groupByBook(allData);
    
    for (const [bookId, verses] of Object.entries(groupedByBook)) {
      const book = BIBLE_BOOKS.find(b => b.id === bookId);
      if (!book) continue;
      
      html += `<h2>${book.name}</h2>\n`;
      
      verses.sort((a, b) => {
        if (a.chapter !== b.chapter) return a.chapter - b.chapter;
        return a.verses[0] - b.verses[0];
      });
      
      for (const verse of verses) {
        html += `<h3>${book.name} ${verse.chapter}:${verse.verses.join('-')}</h3>\n`;
        
        if (verse.personalNote) {
          html += '<div class="note">\n';
          html += '<strong>Personal Note:</strong><br>\n';
          html += verse.personalNote.text;
          html += '\n</div>\n';
        }
        
        if (verse.aiResearch.length > 0) {
          html += '<div class="research">\n';
          html += '<strong>AI Research:</strong>\n';
          html += '<ul>\n';
          for (const research of verse.aiResearch) {
            html += '<li>\n';
            html += `<strong>Q:</strong> ${this.escapeHtml(research.query)}<br>\n`;
            html += `<strong>A:</strong> ${this.escapeHtml(research.response)}`;
            if (research.tags && research.tags.length > 0) {
              html += `<br><span class="tags">Tags: ${research.tags.join(', ')}</span>`;
            }
            html += '\n</li>\n';
          }
          html += '</ul>\n';
          html += '</div>\n';
        }
      }
    }
    
    html += '</body></html>';
    return html;
  }

  // Download file to user's device
  downloadFile(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Export and download in specified format
  async exportAndDownload(format: 'json' | 'markdown' | 'html' = 'json') {
    const timestamp = new Date().toISOString().split('T')[0];
    
    try {
      let content: string;
      let filename: string;
      let mimeType: string;
      
      switch (format) {
        case 'markdown':
          content = await this.exportToMarkdown();
          filename = `bible-notes-${timestamp}.md`;
          mimeType = 'text/markdown';
          break;
          
        case 'html':
          content = await this.exportToHTML();
          filename = `bible-notes-${timestamp}.html`;
          mimeType = 'text/html';
          break;
          
        case 'json':
        default:
          content = await this.exportToJSON();
          filename = `bible-notes-${timestamp}.json`;
          mimeType = 'application/json';
          break;
      }
      
      this.downloadFile(content, filename, mimeType);
      return { success: true };
    } catch (error) {
      console.error('Export failed:', error);
      return { success: false, error };
    }
  }

  // Import data from JSON
  async importFromJSON(jsonString: string, strategy: MergeStrategy = 'merge_combine'): Promise<{
    success: boolean;
    imported: number;
    skipped: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let imported = 0;
    let skipped = 0;
    
    try {
      const importData = JSON.parse(jsonString) as BibleNotesExport;
      
      // Validate format
      if (importData.version !== '1.0') {
        errors.push('Unsupported export version');
        return { success: false, imported, skipped, errors };
      }
      
      // Convert object to array for import
      const dataArray = Object.values(importData.data);
      
      // Import with selected strategy
      for (const item of dataArray) {
        try {
          const existing = await verseDataStorage.getVerseData(
            item.bookId,
            item.chapter,
            item.verses
          );
          
          if (existing && strategy === 'skip_existing') {
            skipped++;
            continue;
          }
          
          if (!existing || strategy === 'replace') {
            // Direct import
            await this.importSingleItem(item);
            imported++;
          } else if (strategy === 'merge_newer') {
            // Keep newer version
            const shouldImport = this.isNewer(item, existing);
            if (shouldImport) {
              await this.importSingleItem(item);
              imported++;
            } else {
              skipped++;
            }
          } else if (strategy === 'merge_combine') {
            // Combine both
            const merged = this.mergeItems(existing, item);
            await this.importSingleItem(merged);
            imported++;
          }
        } catch (itemError) {
          errors.push(`Failed to import ${item.id}: ${itemError}`);
        }
      }
      
      return { success: errors.length === 0, imported, skipped, errors };
    } catch (error) {
      errors.push(`Parse error: ${error}`);
      return { success: false, imported, skipped, errors };
    }
  }

  // Helper methods
  private calculateMetadata(data: VerseData[]) {
    const booksSet = new Set<string>();
    let totalNotes = 0;
    let totalResearch = 0;
    
    for (const item of data) {
      booksSet.add(item.bookId);
      if (item.personalNote) totalNotes++;
      totalResearch += item.aiResearch.length;
    }
    
    return {
      totalNotes,
      totalResearch,
      booksIncluded: Array.from(booksSet)
    };
  }

  private groupByBook(data: VerseData[]): Record<string, VerseData[]> {
    const grouped: Record<string, VerseData[]> = {};
    
    for (const item of data) {
      if (!grouped[item.bookId]) {
        grouped[item.bookId] = [];
      }
      grouped[item.bookId].push(item);
    }
    
    return grouped;
  }

  private htmlToMarkdown(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<p>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&amp;/g, '&')
      .trim();
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private async importSingleItem(item: VerseData) {
    if (item.personalNote) {
      await verseDataStorage.savePersonalNote(
        item.bookId,
        item.chapter,
        item.verses,
        item.personalNote
      );
    }
    
    for (const research of item.aiResearch) {
      await verseDataStorage.addAIResearch(
        item.bookId,
        item.chapter,
        item.verses,
        {
          query: research.query,
          response: research.response,
          selectedText: research.selectedText,
          tags: research.tags,
          highlighted: research.highlighted
        }
      );
    }
  }

  private isNewer(item1: VerseData, item2: VerseData): boolean {
    const time1 = item1.personalNote?.updatedAt || 0;
    const time2 = item2.personalNote?.updatedAt || 0;
    return time1 > time2;
  }

  private mergeItems(existing: VerseData, incoming: VerseData): VerseData {
    const merged: VerseData = {
      ...existing,
      personalNote: this.isNewer(incoming, existing) 
        ? incoming.personalNote 
        : existing.personalNote,
      aiResearch: [...existing.aiResearch]
    };
    
    // Add new research entries
    const existingIds = new Set(existing.aiResearch.map(r => r.id));
    for (const research of incoming.aiResearch) {
      if (!existingIds.has(research.id)) {
        merged.aiResearch.push(research);
      }
    }
    
    return merged;
  }

  // Export Bible texts for offline reading
  async exportBibleTexts(): Promise<string> {
    try {
      console.log('exportBibleTexts: Getting all chapters...');
      // Get all stored chapters directly
      const chapters = await bibleStorage.getAllChapters();
      console.log('exportBibleTexts: Got', chapters.length, 'chapters');
      
      const translations = new Set<string>();
      
      // Track translations
      chapters.forEach(chapter => {
        translations.add(chapter.translation);
      });
      
      const exportData: BibleTextExport = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        metadata: {
          totalChapters: chapters.length,
          translations: Array.from(translations)
        },
        chapters
      };
      
      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('exportBibleTexts failed:', error);
      // Return empty export on error
      return JSON.stringify({
        version: '1.0',
        exportDate: new Date().toISOString(),
        metadata: {
          totalChapters: 0,
          translations: []
        },
        chapters: []
      }, null, 2);
    }
  }

  // Import Bible texts
  async importBibleTexts(jsonString: string): Promise<{
    success: boolean;
    imported: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let imported = 0;
    
    try {
      const importData = JSON.parse(jsonString) as BibleTextExport;
      
      // Validate format
      if (importData.version !== '1.0') {
        errors.push('Unsupported Bible text export version');
        return { success: false, imported, errors };
      }
      
      // Import each chapter
      for (const chapter of importData.chapters) {
        try {
          await bibleStorage.saveChapter(
            chapter.bookId,
            chapter.chapter,
            chapter.translation,
            chapter.data
          );
          imported++;
        } catch (error) {
          errors.push(`Failed to import ${chapter.bookId} ${chapter.chapter} (${chapter.translation}): ${error}`);
        }
      }
      
      return { success: errors.length === 0, imported, errors };
    } catch (error) {
      errors.push(`Parse error: ${error}`);
      return { success: false, imported, errors };
    }
  }

  // Export both notes and Bible texts
  async exportAll(): Promise<{
    notes: string;
    bibleTexts: string;
  }> {
    const [notes, bibleTexts] = await Promise.all([
      this.exportToJSON(),
      this.exportBibleTexts()
    ]);
    
    return { notes, bibleTexts };
  }

  // Download all data as a single ZIP file (using a simple tar-like format)
  async exportAndDownloadAll() {
    try {
      console.log('exportAndDownloadAll: Starting export');
      const timestamp = new Date().toISOString().split('T')[0];
      
      // Export notes
      console.log('exportAndDownloadAll: Exporting notes...');
      const notesContent = await this.exportToJSON();
      console.log('exportAndDownloadAll: Notes exported, length:', notesContent.length);
      
      // Export Bible texts
      console.log('exportAndDownloadAll: Exporting Bible texts...');
      const bibleContent = await this.exportBibleTexts();
      console.log('exportAndDownloadAll: Bible texts exported, length:', bibleContent.length);
      
      // Create a combined JSON with both exports
      const combinedExport = {
        version: '2.0',
        exportDate: new Date().toISOString(),
        deviceId: this.deviceId,
        notes: JSON.parse(notesContent),
        bibleTexts: JSON.parse(bibleContent)
      };
      
      console.log('exportAndDownloadAll: Creating combined content...');
      const combinedContent = JSON.stringify(combinedExport, null, 2);
      const filename = `bible-app-backup-${timestamp}.json`;
      
      console.log('exportAndDownloadAll: Downloading file:', filename);
      this.downloadFile(combinedContent, filename, 'application/json');
      console.log('exportAndDownloadAll: Download initiated successfully');
      return { success: true };
    } catch (error: any) {
      console.error('Export failed with error:', error.message || error);
      console.error('Stack trace:', error.stack);
      return { success: false, error: error.message || String(error) };
    }
  }

  // Import combined backup
  async importCombinedBackup(jsonString: string, notesStrategy: MergeStrategy = 'merge_combine'): Promise<{
    success: boolean;
    notesImported: number;
    notesSkipped: number;
    chaptersImported: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    
    try {
      const importData = JSON.parse(jsonString);
      
      // Check version
      if (importData.version === '2.0') {
        // Combined format
        const notesResult = await this.importFromJSON(
          JSON.stringify(importData.notes),
          notesStrategy
        );
        
        const bibleResult = await this.importBibleTexts(
          JSON.stringify(importData.bibleTexts)
        );
        
        return {
          success: notesResult.success && bibleResult.success,
          notesImported: notesResult.imported,
          notesSkipped: notesResult.skipped,
          chaptersImported: bibleResult.imported,
          errors: [...notesResult.errors, ...bibleResult.errors]
        };
      } else if (importData.version === '1.0' && importData.data) {
        // Old notes-only format
        const notesResult = await this.importFromJSON(jsonString, notesStrategy);
        return {
          success: notesResult.success,
          notesImported: notesResult.imported,
          notesSkipped: notesResult.skipped,
          chaptersImported: 0,
          errors: notesResult.errors
        };
      } else if (importData.version === '1.0' && importData.chapters) {
        // Bible texts only format
        const bibleResult = await this.importBibleTexts(jsonString);
        return {
          success: bibleResult.success,
          notesImported: 0,
          notesSkipped: 0,
          chaptersImported: bibleResult.imported,
          errors: bibleResult.errors
        };
      } else {
        errors.push('Unrecognized backup format');
        return {
          success: false,
          notesImported: 0,
          notesSkipped: 0,
          chaptersImported: 0,
          errors
        };
      }
    } catch (error) {
      errors.push(`Parse error: ${error}`);
      return {
        success: false,
        notesImported: 0,
        notesSkipped: 0,
        chaptersImported: 0,
        errors
      };
    }
  }
}

export const exportImportService = new ExportImportService();