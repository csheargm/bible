import React, { useEffect, useState } from 'react';
import { readingHistory, ReadingHistoryEntry } from '../services/readingHistory';
import { BIBLE_BOOKS } from '../constants';

interface ReadingHistoryProps {
  onSelectChapter: (bookId: string, chapter: number) => void;
  onClose: () => void;
}

export const ReadingHistory: React.FC<ReadingHistoryProps> = ({ onSelectChapter, onClose }) => {
  const [history, setHistory] = useState<ReadingHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const recentHistory = await readingHistory.getRecentHistory(30);
      setHistory(recentHistory);
    } catch (error) {
      console.error('Failed to load reading history:', error);
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = async () => {
    if (confirm('Are you sure you want to clear your reading history?')) {
      await readingHistory.clearHistory();
      setHistory([]);
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor(diff / (1000 * 60));

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="reading-history-modal">
      <div className="reading-history-overlay" onClick={onClose} />
      <div className="reading-history-content">
        <div className="reading-history-header">
          <h2>📚 Reading History</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <div className="loading">Loading history...</div>
        ) : history.length === 0 ? (
          <div className="empty-state">
            <p>No reading history yet</p>
            <p className="empty-subtitle">Your recently read chapters will appear here</p>
          </div>
        ) : (
          <>
            <div className="history-list">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="history-item"
                  onClick={() => {
                    onSelectChapter(entry.bookId, entry.chapter);
                    onClose();
                  }}
                >
                  <div className="history-item-main">
                    <span className="book-name">{entry.bookName}</span>
                    <span className="chapter">Chapter {entry.chapter}</span>
                    <div className="indicators">
                      {entry.hasNotes && <span className="indicator notes" title="Has notes">📝</span>}
                      {entry.hasAIResearch && <span className="indicator research" title="Has AI research">🤖</span>}
                    </div>
                  </div>
                  <span className="timestamp">{formatTimestamp(entry.timestamp)}</span>
                </div>
              ))}
            </div>
            
            <div className="history-footer">
              <button className="clear-history-btn" onClick={clearHistory}>
                Clear History
              </button>
            </div>
          </>
        )}
      </div>

      <style>{`
        .reading-history-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .reading-history-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
        }

        .reading-history-content {
          position: relative;
          background: white;
          border-radius: 12px;
          width: 90%;
          max-width: 500px;
          max-height: 70vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        .reading-history-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px;
          border-bottom: 1px solid #e0e0e0;
        }

        .reading-history-header h2 {
          margin: 0;
          font-size: 20px;
          font-weight: 600;
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          padding: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          color: #666;
          transition: background 0.2s;
        }

        .close-btn:hover {
          background: #f0f0f0;
        }

        .loading, .empty-state {
          padding: 40px 20px;
          text-align: center;
          color: #666;
        }

        .empty-state p {
          margin: 8px 0;
        }

        .empty-subtitle {
          font-size: 14px;
          color: #999;
        }

        .history-list {
          flex: 1;
          overflow-y: auto;
          padding: 10px;
        }

        .history-item {
          padding: 12px 16px;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.2s;
          margin-bottom: 6px;
          border: 1px solid #e0e0e0;
        }

        .history-item:hover {
          background: #f8f8f8;
          border-color: #d0d0d0;
        }

        .history-item-main {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
        }

        .book-name {
          font-weight: 500;
          color: #333;
        }

        .chapter {
          color: #666;
          font-size: 14px;
        }

        .indicators {
          display: flex;
          gap: 4px;
          margin-left: auto;
        }

        .indicator {
          font-size: 14px;
        }

        .timestamp {
          font-size: 12px;
          color: #999;
        }

        .history-footer {
          padding: 12px 20px;
          border-top: 1px solid #e0e0e0;
        }

        .clear-history-btn {
          background: #f44336;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          transition: background 0.2s;
        }

        .clear-history-btn:hover {
          background: #d32f2f;
        }

        @media (max-width: 600px) {
          .reading-history-content {
            width: 95%;
            max-height: 80vh;
          }
        }
      `}</style>
    </div>
  );
};