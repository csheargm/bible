import React, { useState, useEffect } from 'react';
import { BIBLE_BOOKS } from '../constants';
import { verseDataStorage } from '../services/verseDataStorage';

interface SaveResearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  response: string;
  selectedText?: string;
  currentBookId?: string;
  currentChapter?: number;
}

const SaveResearchModal: React.FC<SaveResearchModalProps> = ({
  isOpen,
  onClose,
  query,
  response,
  selectedText,
  currentBookId,
  currentChapter
}) => {
  const [selectedBook, setSelectedBook] = useState<string>(currentBookId || 'genesis');
  const [selectedChapter, setSelectedChapter] = useState<number>(currentChapter || 1);
  const [selectedVerse, setSelectedVerse] = useState<number>(1);
  const [tags, setTags] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (currentBookId) setSelectedBook(currentBookId);
    if (currentChapter) setSelectedChapter(currentChapter);
  }, [currentBookId, currentChapter]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    
    console.log('[SaveResearchModal] Saving research to:', {
      selectedBook,
      selectedChapter,
      selectedVerse,
      query,
      response: response.substring(0, 100) + '...'
    });
    
    try {
      const tagArray = tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      await verseDataStorage.addAIResearch(
        selectedBook,
        selectedChapter,
        [selectedVerse],
        {
          query,
          response,
          selectedText,
          tags: tagArray
        }
      );

      // Update reading history to indicate this chapter has AI research
      const { readingHistory } = await import('../services/readingHistory');
      await readingHistory.updateChapterStatus(
        selectedBook,
        selectedChapter,
        undefined,
        true
      );

      onClose();
    } catch (error) {
      console.error('Failed to save research:', error);
      alert('Failed to save research. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedBookData = BIBLE_BOOKS.find(b => b.id === selectedBook);
  const maxChapters = selectedBookData?.chapters || 1;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Save AI Research to Verse</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="research-preview">
            <div className="preview-section">
              <label>Query:</label>
              <div className="preview-text">{query}</div>
            </div>
            
            <div className="preview-section">
              <label>Response:</label>
              <div className="preview-text response">
                {response.length > 200 
                  ? response.substring(0, 200) + '...' 
                  : response}
              </div>
            </div>
          </div>

          <div className="verse-selector">
            <h3>Select Verse Location</h3>
            
            <div className="selector-row">
              <label>Book:</label>
              <select 
                value={selectedBook} 
                onChange={(e) => {
                  setSelectedBook(e.target.value);
                  setSelectedChapter(1);
                  setSelectedVerse(1);
                }}
              >
                {BIBLE_BOOKS.map(book => (
                  <option key={book.id} value={book.id}>
                    {book.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="selector-row">
              <label>Chapter:</label>
              <select 
                value={selectedChapter} 
                onChange={(e) => {
                  setSelectedChapter(Number(e.target.value));
                  setSelectedVerse(1);
                }}
              >
                {Array.from({ length: maxChapters }, (_, i) => i + 1).map(num => (
                  <option key={num} value={num}>
                    Chapter {num}
                  </option>
                ))}
              </select>
            </div>

            <div className="selector-row">
              <label>Verse:</label>
              <input
                type="number"
                min="1"
                value={selectedVerse}
                onChange={(e) => setSelectedVerse(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="tags-section">
            <label>Tags (optional, comma-separated):</label>
            <input
              type="text"
              placeholder="e.g., faith, prophecy, history"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="cancel-btn" onClick={onClose}>
            Cancel
          </button>
          <button 
            className="save-btn" 
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Research'}
          </button>
        </div>
      </div>

      <style>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
        }

        .modal-content {
          background: white;
          border-radius: 12px;
          width: 90%;
          max-width: 500px;
          max-height: 80vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid #e0e0e0;
        }

        .modal-header h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #666;
          padding: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .close-btn:hover {
          background: #f0f0f0;
          border-radius: 6px;
        }

        .modal-body {
          padding: 20px;
          overflow-y: auto;
          flex: 1;
        }

        .research-preview {
          background: #f8f8f8;
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 20px;
        }

        .preview-section {
          margin-bottom: 12px;
        }

        .preview-section:last-child {
          margin-bottom: 0;
        }

        .preview-section label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: #666;
          margin-bottom: 4px;
        }

        .preview-text {
          font-size: 13px;
          color: #333;
          line-height: 1.5;
        }

        .preview-text.response {
          max-height: 100px;
          overflow-y: auto;
        }

        .verse-selector {
          margin-bottom: 20px;
        }

        .verse-selector h3 {
          font-size: 14px;
          font-weight: 600;
          margin: 0 0 12px 0;
        }

        .selector-row {
          display: flex;
          align-items: center;
          margin-bottom: 12px;
        }

        .selector-row label {
          width: 80px;
          font-size: 13px;
          font-weight: 500;
        }

        .selector-row select,
        .selector-row input {
          flex: 1;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 13px;
        }

        .tags-section label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          margin-bottom: 6px;
        }

        .tags-section input {
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 13px;
        }

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          padding: 16px 20px;
          border-top: 1px solid #e0e0e0;
        }

        .cancel-btn,
        .save-btn {
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }

        .cancel-btn {
          background: white;
          border: 1px solid #ddd;
          color: #666;
        }

        .cancel-btn:hover {
          background: #f0f0f0;
        }

        .save-btn {
          background: #4f46e5;
          border: none;
          color: white;
        }

        .save-btn:hover:not(:disabled) {
          background: #4338ca;
        }

        .save-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        @media (max-width: 600px) {
          .modal-content {
            width: 95%;
            max-height: 90vh;
          }
        }
      `}</style>
    </div>
  );
};

export default SaveResearchModal;