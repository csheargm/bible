
import React, { useState, useEffect, useRef } from 'react';
import { SelectionInfo, NoteData } from '../types';
import DrawingCanvas, { DrawingCanvasHandle } from './DrawingCanvas';
import { downloadNote, readNoteFile } from '../services/fileSystem';
import * as aiService from '../services/gemini';

interface NotebookProps {
  selection: SelectionInfo | null;
  onSaveNote: (id: string, content: string) => void;
  initialContent: string;
}

const Notebook: React.FC<NotebookProps> = ({ selection, onSaveNote, initialContent }) => {
  const [noteData, setNoteData] = useState<NoteData>({ text: "", drawing: "" });
  const [isSaved, setIsSaved] = useState(true);
  const [mode, setMode] = useState<'text' | 'draw' | 'overlay'>('text');
  const [timestamps, setTimestamps] = useState<{created?: string, modified?: string}>({});
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [drawingTool, setDrawingTool] = useState<'pen' | 'marker' | 'highlighter' | 'eraser'>('pen');
  const [drawingColor, setDrawingColor] = useState('#000000');
  const [drawingSize, setDrawingSize] = useState(2);
  const [isWritingMode, setIsWritingMode] = useState(true);
  
  const editorRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<DrawingCanvasHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoSaveTimer = useRef<number | null>(null);
  const lastActivityTime = useRef<number>(Date.now());
  const hasInsertedTimestamp = useRef(false);
  
  const currentIdRef = useRef<string | null>(null);
  const isDirtyRef = useRef(false);

  const isContentEmpty = (html: string, drawing: string) => {
    const hasDrawing = !!drawing && drawing.length > 200; 
    if (hasDrawing) return false;

    const stripped = html.replace(/<[^>]*>/g, '').trim();
    if (stripped.length === 0) return true;

    const hasBlockquote = html.includes('blockquote');
    if (hasBlockquote) {
      return stripped.length < 5; 
    }

    return stripped.length === 0;
  };

  const performSave = (id: string, currentNoteData: NoteData) => {
    const html = editorRef.current?.innerHTML || "";
    const now = new Date().toISOString();
    const existingTimestamp = timestamps.created || currentNoteData.timestamp;
    const finalData = { 
      ...currentNoteData, 
      text: html,
      lastModified: now,
      timestamp: existingTimestamp || now // Set timestamp on first save
    };
    
    // Update timestamp display
    setTimestamps({
      created: finalData.timestamp,
      modified: finalData.lastModified
    });
    
    if (isContentEmpty(finalData.text, finalData.drawing)) {
      onSaveNote(id, "");
    } else {
      onSaveNote(id, JSON.stringify(finalData));
    }
    
    isDirtyRef.current = false;
    setIsSaved(true);
  };

  const flushSave = () => {
    if (isDirtyRef.current && currentIdRef.current) {
      if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current);
      performSave(currentIdRef.current, noteData);
    }
  };

  useEffect(() => {
    if (editorRef.current && mode === 'text') {
      if (editorRef.current.innerHTML !== noteData.text) {
        editorRef.current.innerHTML = noteData.text || "<p><br></p>";
      }
    }
  }, [mode]);

  useEffect(() => {
    if (selection) {
      if (currentIdRef.current && selection.id !== currentIdRef.current) {
        flushSave();
        // Reset timestamp tracking when switching to new verse
        lastActivityTime.current = Date.now();
        hasInsertedTimestamp.current = false;
      }
      
      currentIdRef.current = selection.id;
      
      let data: NoteData;
      const hasExistingNote = !!initialContent && initialContent.trim() !== "";

      try {
        data = hasExistingNote ? JSON.parse(initialContent) : { text: "", drawing: "" };
        // Extract timestamps from loaded data
        if (data.timestamp || data.lastModified) {
          setTimestamps({
            created: data.timestamp,
            modified: data.lastModified
          });
        } else {
          setTimestamps({});
        }
      } catch {
        data = { text: initialContent || "", drawing: "" };
        setTimestamps({});
      }
      
      if (!hasExistingNote && !data.text && !data.drawing && selection.selectedRawText) {
        // Construct a clean citation using the selection context
        const reference = `${selection.bookName} 第 ${selection.chapter} 章 ${selection.verseNums.length === 1 ? `第 ${selection.verseNums[0]} 节` : ''}`;
        
        let displayQuote = selection.selectedRawText;
        if (displayQuote.includes('和合本:')) {
            const parts = displayQuote.split('\n');
            displayQuote = parts.slice(1).join('<br/>');
        } else {
            displayQuote = displayQuote.replace(/\n/g, '<br/>');
        }

        data.text = `<blockquote class="border-l-4 border-indigo-500 pl-4 py-1 my-4 bg-slate-50 italic text-slate-600"><strong>${reference}</strong><br/>${displayQuote}</blockquote><p><br></p>`;
        
        isDirtyRef.current = false;
        setIsSaved(true);
      } else {
        setIsSaved(true);
        isDirtyRef.current = false;
      }

      setNoteData(data);
      if (editorRef.current) {
        editorRef.current.innerHTML = data.text || "<p><br></p>";
      }
      
      // Check if note has user-added content (not just the auto-inserted verse quote)
      // A note with only a blockquote and empty paragraph is considered "empty" for timestamp purposes
      const isJustQuote = data.text && data.text.includes('<blockquote') && 
                          data.text.endsWith('</blockquote><p><br></p>');
      const hasUserContent = data.text && 
                             data.text !== "<p><br></p>" && 
                             !isJustQuote &&
                             data.text.replace(/<[^>]*>/g, '').trim().length > 0;
      
      if (hasUserContent) {
        hasInsertedTimestamp.current = true; // Don't insert timestamp if note already has user content
      } else {
        hasInsertedTimestamp.current = false; // Allow timestamp insertion for empty notes or just-quoted verses
      }
    }

    return () => flushSave();
  }, [selection?.id, initialContent === ""]); 

  const insertTimestamp = () => {
    if (!editorRef.current) return;
    
    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
    const dateStr = now.toLocaleDateString('zh-CN', { 
      year: 'numeric',
      month: 'short', 
      day: 'numeric' 
    });
    
    // Create timestamp element with a space after
    const timestampSpan = document.createElement('span');
    timestampSpan.contentEditable = 'false';
    timestampSpan.className = 'text-[10px] text-slate-400 font-bold select-none';
    timestampSpan.textContent = `[${dateStr} ${timeStr}]`;
    
    // Create a text node with a space
    const spaceNode = document.createTextNode(' ');
    
    // Get current selection
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      
      // Find the start of the current line/paragraph
      let container = range.startContainer;
      let node = container;
      
      // If we're in a text node, get its parent element
      if (node.nodeType === Node.TEXT_NODE) {
        node = node.parentNode as Node;
      }
      
      // Find the paragraph or line break element
      while (node && node !== editorRef.current && node.nodeName !== 'P' && node.nodeName !== 'DIV') {
        node = node.parentNode as Node;
      }
      
      if (node && node.nodeName === 'P') {
        // Insert at the beginning of the paragraph
        const firstChild = node.firstChild;
        if (firstChild) {
          node.insertBefore(timestampSpan, firstChild);
          node.insertBefore(spaceNode, firstChild);
        } else {
          node.appendChild(timestampSpan);
          node.appendChild(spaceNode);
        }
        
        // Keep cursor at its current position
        // No need to move the cursor
      } else {
        // Fallback: insert at cursor position
        range.insertNode(timestampSpan);
        range.setStartAfter(timestampSpan);
        range.insertNode(spaceNode);
        range.setStartAfter(spaceNode);
        range.setEndAfter(spaceNode);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      
      // Focus the editor
      editorRef.current.focus();
    }
    
    hasInsertedTimestamp.current = true;
    console.log('Timestamp inserted:', dateStr, timeStr);
  };

  const onEditorInput = (e?: React.FormEvent) => {
    const now = Date.now();
    const timeSinceLastActivity = now - lastActivityTime.current;
    
    // Get current text content from the editor directly
    const currentHTML = editorRef.current?.innerHTML || '';
    const currentText = currentHTML.replace(/<[^>]*>/g, '').trim();
    
    // Insert timestamp when:
    // 1. Starting a new note (empty note, first input)
    // 2. After 2+ minutes of idle time
    if (timeSinceLastActivity > 2 * 60 * 1000) {
      // Reset the flag when idle time has passed
      hasInsertedTimestamp.current = false;
    }
    
    // Check if the note is just the auto-inserted verse quote
    const isJustQuote = noteData.text && noteData.text.includes('<blockquote') && 
                        noteData.text.endsWith('</blockquote><p><br></p>');
    
    // Check if we should insert timestamp for empty note or after idle
    const shouldInsertTimestamp = !hasInsertedTimestamp.current && currentText.length > 0 && 
                                  (timeSinceLastActivity > 2 * 60 * 1000 || 
                                   (!noteData.text || noteData.text === '<p><br></p>' || isJustQuote));
    
    if (shouldInsertTimestamp) {
      console.log('Inserting timestamp - idle time:', timeSinceLastActivity);
      insertTimestamp();
      hasInsertedTimestamp.current = true;
    }
    
    // Update last activity time
    lastActivityTime.current = now;
    
    // Update noteData.text to keep it in sync
    setNoteData(prev => ({ ...prev, text: currentHTML }));
    
    setIsSaved(false);
    isDirtyRef.current = true; 
    if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = window.setTimeout(() => {
      if (currentIdRef.current) performSave(currentIdRef.current, { ...noteData, text: currentHTML });
    }, 2000);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // User pressed Enter to create a new line
      const now = Date.now();
      const timeSinceLastActivity = now - lastActivityTime.current;
      
      // Only insert timestamp if MORE than 2 minutes have passed since last activity
      if (timeSinceLastActivity > 2 * 60 * 1000 && editorRef.current) {
        // Reset the flag since idle time has passed
        hasInsertedTimestamp.current = false;
        
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          // Let the default Enter behavior happen first
          setTimeout(() => {
            console.log('New line created after idle, inserting timestamp');
            insertTimestamp();
          }, 10);
        }
      }
    }
  };

  const execCommand = (command: string, value: string = '') => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    onEditorInput();
  };

  const handleSpeak = () => {
    const text = editorRef.current?.innerText || '';
    if (!text.trim()) return;
    setIsSpeaking(true);
    aiService.speak(text, () => setIsSpeaking(false));
  };

  const handleStopSpeak = () => {
    aiService.stopSpeech();
    setIsSpeaking(false);
  };

  const handleDrawingChange = (drawing: string) => {
    setNoteData(prev => {
      const updated = { ...prev, drawing };
      setIsSaved(false);
      isDirtyRef.current = true; 
      if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = window.setTimeout(() => {
        if (currentIdRef.current) performSave(currentIdRef.current, updated);
      }, 2000);
      return updated;
    });
  };

  const handleExport = () => {
    if (!selection) return;
    flushSave();
    const currentHtml = editorRef.current?.innerHTML || "";
    const dataToSave = { ...noteData, text: currentHtml, version: 1 };
    downloadNote(`VerseNote_${selection.id}`, dataToSave);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selection) return;

    try {
      const importedData = await readNoteFile(file);
      setNoteData(importedData);
      if (editorRef.current) editorRef.current.innerHTML = importedData.text;
      setIsSaved(false);
      isDirtyRef.current = true;
      performSave(selection.id, importedData);
    } catch (err: any) {
      alert(err.message);
    } finally {
      e.target.value = "";
    }
  };

  const getTitle = () => {
    if (!selection) return "研读笔记 Workspace";
    const ref = `${selection.bookName} 第 ${selection.chapter} 章`;
    return `${ref} ${selection.verseNums.length === 1 ? `第 ${selection.verseNums[0]} 节` : ''}`;
  };
  
  const formatTimestamp = (isoString: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 1) {
      const minutes = Math.floor(diffInHours * 60);
      return minutes <= 1 ? '刚刚' : `${minutes}分钟前`;
    } else if (diffInHours < 24) {
      const hours = Math.floor(diffInHours);
      return `${hours}小时前`;
    } else if (diffInHours < 168) { // 7 days
      const days = Math.floor(diffInHours / 24);
      return `${days}天前`;
    } else {
      return date.toLocaleDateString('zh-CN', { 
        year: 'numeric',
        month: 'short', 
        day: 'numeric'
      });
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 border-l border-slate-200">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept=".bible-note,.json" 
        className="hidden" 
      />

      <div className="p-3 border-b bg-white flex justify-between items-center shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            {getTitle()}
          </h3>
          <div className="flex bg-slate-100 p-0.5 rounded-lg">
            <button 
              onClick={() => setMode('text')}
              className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${mode === 'text' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
              title="Text mode"
            >文字</button>
            <button 
              onClick={() => setMode('draw')}
              className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${mode === 'draw' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
              title="Drawing mode"
            >绘图</button>
            <button 
              onClick={() => setMode('overlay')}
              className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${mode === 'overlay' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
              title="Overlay drawing on text"
            >叠加</button>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5">
           <button 
             onClick={handleImportClick}
             disabled={!selection}
             className="p-1.5 rounded-lg text-slate-400 bg-slate-100 hover:text-indigo-500 hover:bg-indigo-50 transition-all disabled:opacity-30"
             title="替换当前这节经文的笔记"
           >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
           </button>

           <button 
             onClick={handleExport}
             disabled={!selection}
             className="p-1.5 rounded-lg text-slate-400 bg-slate-100 hover:text-indigo-500 hover:bg-indigo-50 transition-all disabled:opacity-30"
             title="仅导出当前这节经文的笔记"
           >
             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
           </button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden bg-white">
        {!selection && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 gap-4 z-50 pointer-events-none p-8 text-center">
            <svg className="w-12 h-12 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
            <p className="text-sm italic">请选择经文或高亮文字以开启笔记</p>
          </div>
        )}
        
        <div className={`absolute inset-0 flex flex-col transition-opacity duration-300 ${(mode === 'text' || mode === 'overlay') && selection ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
          <div className="flex items-center gap-1 p-2 bg-slate-50 border-b shrink-0 overflow-x-auto no-scrollbar">
            <button onClick={() => execCommand('bold')} className="p-1.5 hover:bg-indigo-50 hover:text-indigo-600 rounded transition-colors"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M15.6 11.8c1-.7 1.6-1.8 1.6-2.8 0-2.3-1.8-4.1-4-4.1H8v14h5.2c2.2 0 4-1.8 4-4 0-1.3-.7-2.4-1.6-3.1zM10.1 7.1h2.9c1.1 0 2 .9 2 2s-.9 2-2 2h-2.9V7.1zm3.2 9.8h-3.2v-3.9h3.2c1.1 0 2 .9 2 2s-.9 1.9-2 1.9z"/></svg></button>
            <button onClick={() => execCommand('italic')} className="p-1.5 hover:bg-indigo-50 hover:text-indigo-600 rounded transition-colors"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M10 5v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V5z"/></svg></button>
            <button onClick={() => execCommand('underline')} className="p-1.5 hover:bg-indigo-50 hover:text-indigo-600 rounded transition-colors"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z"/></svg></button>
            <div className="h-4 w-[1px] bg-slate-300 mx-1"></div>
            <button onClick={() => execCommand('formatBlock', 'blockquote')} className="p-1.5 hover:bg-indigo-50 hover:text-indigo-600 rounded transition-colors"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"/></svg></button>
            <button onClick={() => execCommand('insertUnorderedList')} className="p-1.5 hover:bg-indigo-50 hover:text-indigo-600 rounded transition-colors"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg></button>
            <div className="h-4 w-[1px] bg-slate-300 mx-1"></div>
            <button 
              onClick={isSpeaking ? handleStopSpeak : handleSpeak} 
              className={`p-1.5 rounded transition-colors ${isSpeaking ? 'bg-red-50 text-red-500' : 'hover:bg-indigo-50 hover:text-indigo-600'}`}
              title={isSpeaking ? "停止朗读" : "朗读笔记"}
            >
              {isSpeaking ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
              )}
            </button>
          </div>
          <div 
            ref={editorRef}
            contentEditable
            onInput={onEditorInput}
            onBlur={onEditorInput}
            onKeyDown={onKeyDown}
            suppressContentEditableWarning
            className="flex-1 p-6 overflow-y-auto prose prose-slate prose-indigo max-w-none focus:outline-none text-slate-800 font-serif-sc text-lg leading-relaxed"
            style={{ minHeight: '300px' }}
          />
        </div>

        {/* Overlay drawing canvas */}
        {mode === 'overlay' && selection && (
          <div className="absolute inset-0 z-20 pointer-events-auto">
            <DrawingCanvas
              ref={canvasRef}
              initialData={noteData.drawing}
              onChange={handleDrawingChange}
              overlayMode={true}
              isWritingMode={isWritingMode}
            />
            {/* Floating drawing tools for overlay mode */}
            <div className="absolute bottom-4 right-4 flex flex-col gap-2">
              {/* Writing mode toggle */}
              <div className="bg-white rounded-xl shadow-lg p-2">
                <button
                  onClick={() => setIsWritingMode(!isWritingMode)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
                    isWritingMode 
                      ? 'bg-indigo-100 text-indigo-700' 
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {isWritingMode ? '✏️ Write' : '👆 Navigate'}
                </button>
              </div>
              {/* Drawing tools */}
              <div className={`bg-white rounded-xl shadow-lg p-2 flex gap-1 ${
                isWritingMode ? 'opacity-100' : 'opacity-30 pointer-events-none'
              }`}>
                <button
                  onClick={() => { setDrawingTool('pen'); canvasRef.current?.setTool('pen'); }}
                  className={`p-1.5 rounded ${drawingTool === 'pen' ? 'bg-indigo-100' : 'hover:bg-slate-100'}`}
                  title="Pen"
                >✏️</button>
                <button
                  onClick={() => { setDrawingTool('eraser'); canvasRef.current?.setTool('eraser'); }}
                  className={`p-1.5 rounded ${drawingTool === 'eraser' ? 'bg-red-100' : 'hover:bg-slate-100'}`}
                  title="Eraser"
                >🧹</button>
                <button
                  onClick={() => canvasRef.current?.clear()}
                  className="p-1.5 rounded hover:bg-slate-100"
                  title="Clear"
                >🗑️</button>
              </div>
            </div>
          </div>
        )}
        
        <div className={`absolute inset-0 p-4 transition-opacity duration-300 ${mode === 'draw' && selection ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
          <div className="w-full h-full border border-slate-100 rounded-xl relative overflow-auto bg-slate-50/50">
             {/* Writing mode toggle for iPad */}
             <div className="absolute top-4 left-4 z-30 bg-white rounded-lg shadow-lg p-2 flex items-center gap-2">
               <button
                 onClick={() => setIsWritingMode(!isWritingMode)}
                 className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
                   isWritingMode 
                     ? 'bg-indigo-100 text-indigo-700' 
                     : 'bg-slate-100 text-slate-700'
                 }`}
                 title={isWritingMode ? 'Switch to navigation mode' : 'Switch to writing mode'}
               >
                 {isWritingMode ? (
                   <>
                     <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                     </svg>
                     <span className="text-xs font-semibold">Writing</span>
                   </>
                 ) : (
                   <>
                     <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                     </svg>
                     <span className="text-xs font-semibold">Navigate</span>
                   </>
                 )}
               </button>
               {!isWritingMode && (
                 <span className="text-[10px] text-slate-500 italic">Use finger to scroll/pan</span>
               )}
             </div>
             
             <div className={`${isWritingMode ? '' : 'pointer-events-none'}`} style={{ width: '150%', height: '150%' }}>
               <DrawingCanvas 
                 ref={canvasRef}
                 initialData={noteData.drawing} 
                 onChange={handleDrawingChange}
                 overlayMode={false}
                 isWritingMode={isWritingMode}
               />
             </div>
             {/* Drawing tools palette */}
             <div className={`absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-white rounded-xl shadow-lg p-3 flex flex-col gap-2 transition-opacity ${
               isWritingMode ? 'opacity-100' : 'opacity-30 pointer-events-none'
             }`}>
               <div className="flex gap-1">
                 <button
                   onClick={() => { setDrawingTool('pen'); canvasRef.current?.setTool('pen'); }}
                   className={`p-2 rounded-lg ${drawingTool === 'pen' ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-slate-100'}`}
                   title="Pen"
                 >✏️</button>
                 <button
                   onClick={() => { setDrawingTool('marker'); canvasRef.current?.setTool('marker'); }}
                   className={`p-2 rounded-lg ${drawingTool === 'marker' ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-slate-100'}`}
                   title="Marker"
                 >🖊️</button>
                 <button
                   onClick={() => { setDrawingTool('highlighter'); canvasRef.current?.setTool('highlighter'); }}
                   className={`p-2 rounded-lg ${drawingTool === 'highlighter' ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-slate-100'}`}
                   title="Highlighter"
                 >🖍️</button>
                 <button
                   onClick={() => { setDrawingTool('eraser'); canvasRef.current?.setTool('eraser'); }}
                   className={`p-2 rounded-lg ${drawingTool === 'eraser' ? 'bg-red-100 text-red-600' : 'hover:bg-slate-100'}`}
                   title="Eraser"
                 >🧹</button>
                 <div className="w-px bg-slate-200 mx-1" />
                 <button
                   onClick={() => canvasRef.current?.undo()}
                   className="p-2 rounded-lg hover:bg-slate-100"
                   title="Undo"
                 >↩️</button>
                 <button
                   onClick={() => canvasRef.current?.clear()}
                   className="p-2 rounded-lg hover:bg-slate-100"
                   title="Clear"
                 >🗑️</button>
               </div>
               <div className="flex gap-1 items-center">
                 {['#000000', '#007AFF', '#FF3B30', '#34C759', '#FFCC00'].map(color => (
                   <button
                     key={color}
                     onClick={() => { setDrawingColor(color); canvasRef.current?.setColor(color); }}
                     className={`w-6 h-6 rounded-full border-2 ${drawingColor === color ? 'border-indigo-500' : 'border-transparent'}`}
                     style={{ backgroundColor: color }}
                   />
                 ))}
                 <input
                   type="range"
                   min="1"
                   max="20"
                   value={drawingSize}
                   onChange={(e) => { 
                     const size = Number(e.target.value);
                     setDrawingSize(size);
                     canvasRef.current?.setSize(size);
                   }}
                   className="ml-2 w-20 h-1"
                 />
               </div>
             </div>
          </div>
        </div>
      </div>

      <div className="p-2 px-4 bg-slate-100 border-t flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
           {!isSaved ? (
             <span className="text-[10px] text-amber-600 font-black uppercase flex items-center gap-1.5">
               <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping"></div>
               正在保存...
             </span>
           ) : (
             <span className="text-[10px] text-green-600 font-black uppercase flex items-center gap-1.5">
               <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
               已同步
             </span>
           )}
           {(timestamps.created || timestamps.modified) && (
             <div className="flex items-center gap-2 text-[9px] text-slate-400">
               {timestamps.created && (
                 <span title={new Date(timestamps.created).toLocaleString('zh-CN')}>
                   创建于 {formatTimestamp(timestamps.created)}
                 </span>
               )}
               {timestamps.modified && timestamps.modified !== timestamps.created && (
                 <>
                   <span className="text-slate-300">•</span>
                   <span title={new Date(timestamps.modified).toLocaleString('zh-CN')}>
                     修改于 {formatTimestamp(timestamps.modified)}
                   </span>
                 </>
               )}
             </div>
           )}
        </div>
        <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
          {mode === 'text' ? 'Note Editor' : 'Sketchpad'}
        </div>
      </div>
    </div>
  );
};

export default Notebook;
