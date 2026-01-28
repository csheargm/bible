import React from 'react';
import { useDataStats } from '../hooks/useDataStats';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  showToggle?: boolean;
  onBackup: () => void;
  onRestore: () => void;
  onClear: () => void;
  onVoiceOpen: () => void;
  notesCount: number;
  onDownloadBible?: (() => void) | null;
  onDownloadChapter?: (() => void) | null;
  onDownloadBook?: (() => void) | null;
  downloadProgress?: number;
  isDownloading?: boolean;
  downloadStatus?: string;
  downloadTimeRemaining?: string;
  dataUpdateTrigger?: number;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  isOpen, 
  onToggle, 
  onBackup, 
  onRestore, 
  onClear,
  onVoiceOpen,
  notesCount,
  onDownloadBible,
  onDownloadChapter,
  onDownloadBook,
  downloadProgress = 0,
  isDownloading = false,
  downloadStatus = '',
  downloadTimeRemaining = '',
  showToggle = true,
  dataUpdateTrigger = 0
}) => {
  const { stats, loading } = useDataStats(dataUpdateTrigger);
  return (
    <>
      {/* Toggle Button - Hidden on iPhone */}
      {showToggle && (
        <button
          onClick={onToggle}
          className="fixed left-3 z-50 p-2 bg-white rounded-lg shadow-lg hover:bg-slate-50 transition-all"
          style={{ 
            top: '8px', // Match the header padding
            transform: isOpen ? 'translateX(240px)' : 'translateX(0)',
            transition: 'transform 0.3s ease'
          }}
        >
        <svg 
          className="w-5 h-5 text-slate-600" 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d={isOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} 
          />
        </svg>
        </button>
      )}

      {/* Sidebar */}
      <div 
        className="fixed left-0 top-0 h-full bg-white shadow-2xl z-40 flex flex-col"
        style={{
          width: '280px',
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s ease'
        }}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold shadow-sm text-lg">
              圣
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Scripture Scholar</h2>
              <p className="text-xs text-slate-500">圣经学研</p>
            </div>
          </div>
        </div>

        {/* Menu Items */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Voice Session */}
          <button 
            onClick={onVoiceOpen}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-indigo-50 transition-colors group mb-2"
          >
            <div className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
            </div>
            <span className="flex-1 text-left text-sm font-medium text-slate-700 group-hover:text-indigo-600">
              语音学者 Voice Session
            </span>
          </button>

          <div className="h-px bg-slate-200 my-4"></div>

          {/* Data Summary */}
          <div className="mx-4 p-3 bg-slate-50 rounded-lg">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              数据统计 Data Summary
            </h3>
            {loading ? (
              <div className="text-xs text-slate-400">加载中 Loading...</div>
            ) : (
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">📝 个人笔记 Notes:</span>
                  <span className="font-medium text-slate-700">{stats.personalNotes}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">🔍 AI研究 Research:</span>
                  <span className="font-medium text-slate-700">{stats.aiResearch}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">📖 缓存章节 Chapters:</span>
                  <span className="font-medium text-slate-700">{stats.cachedChapters}</span>
                </div>
                {stats.totalSize && (
                  <div className="flex justify-between pt-1 border-t border-slate-200">
                    <span className="text-slate-600">💾 存储空间 Storage:</span>
                    <span className="font-medium text-slate-700">
                      {(stats.totalSize / (1024 * 1024)).toFixed(1)} MB
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Notes Management */}
          <div className="space-y-2">
            <div className="px-4 py-2 pt-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                笔记管理 Notes Management
              </h3>
            </div>

            <button 
              onClick={onBackup}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-50 transition-colors group"
            >
              <svg className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              <div className="flex-1 text-left">
                <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-600">
                  备份笔记
                </span>
                <span className="block text-xs text-slate-500">
                  Export all notes
                </span>
              </div>
            </button>

            <button 
              onClick={onRestore}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-50 transition-colors group"
            >
              <svg className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <div className="flex-1 text-left">
                <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-600">
                  恢复笔记
                </span>
                <span className="block text-xs text-slate-500">
                  Import from backup
                </span>
              </div>
            </button>

            <button 
              onClick={onClear}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-red-50 transition-colors group"
            >
              <svg className="w-4 h-4 text-slate-400 group-hover:text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <div className="flex-1 text-left">
                <span className="text-sm font-medium text-slate-700 group-hover:text-red-600">
                  清空笔记
                </span>
                <span className="block text-xs text-slate-500">
                  Delete all notes
                </span>
              </div>
            </button>
          </div>

          <div className="h-px bg-slate-200 my-4"></div>

          {/* Offline Download */}
          <div className="space-y-2">
            <div className="px-4 py-2">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                离线下载 Offline Download
              </h3>
            </div>

            {isDownloading ? (
              <div className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm text-slate-600">
                    下载中 {downloadProgress}%
                    {downloadTimeRemaining && ` • ${downloadTimeRemaining}`}
                  </span>
                </div>
                {downloadStatus && (
                  <p className="text-xs text-slate-500 mt-1">{downloadStatus}</p>
                )}
                <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2">
                  <div 
                    className="bg-indigo-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
              </div>
            ) : (
              <>
                {onDownloadChapter && (
                  <button 
                    onClick={() => onDownloadChapter && onDownloadChapter()}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-50 transition-colors group"
                    disabled={isDownloading}
                  >
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                    </svg>
                    <div className="flex-1 text-left">
                      <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-600">
                        下载当前章节
                      </span>
                      <span className="block text-xs text-slate-500">
                        Save current chapter
                      </span>
                    </div>
                  </button>
                )}
                {onDownloadBook && (
                  <button 
                    onClick={() => onDownloadBook && onDownloadBook()}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-50 transition-colors group"
                    disabled={isDownloading}
                  >
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    <div className="flex-1 text-left">
                      <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-600">
                        下载当前书卷
                      </span>
                      <span className="block text-xs text-slate-500">
                        Save current book
                      </span>
                    </div>
                  </button>
                )}
                {onDownloadBible && (
                  <button 
                    onClick={() => onDownloadBible && onDownloadBible()}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-50 transition-colors group"
                    disabled={isDownloading}
                  >
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                    </svg>
                    <div className="flex-1 text-left">
                      <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-600">
                        下载全部圣经
                      </span>
                      <span className="block text-xs text-slate-500">
                        Save all books offline
                      </span>
                    </div>
                  </button>
                )}
              </>
            )}
          </div>

          <div className="h-px bg-slate-200 my-4"></div>

          {/* Settings */}
          <div className="space-y-2">
            <div className="px-4 py-2">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                设置 Settings
              </h3>
            </div>
            
            <div className="px-4 py-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                  defaultChecked
                />
                <span className="text-sm text-slate-700">自动保存笔记</span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200">
          <p className="text-xs text-slate-400 text-center">
            Bible Workspace v1.0
          </p>
        </div>
      </div>

      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-20 z-30"
          onClick={onToggle}
        />
      )}
    </>
  );
};

export default Sidebar;