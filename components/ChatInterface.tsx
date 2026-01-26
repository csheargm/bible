import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { ChatMessage, AspectRatio, ImageSize } from '../types';
import * as aiService from '../services/gemini';

interface ChatInterfaceProps {
  incomingText?: { text: string; id: number } | null;
}

const parseMessage = (content: string, role: string) => {
  if (role === 'assistant') {
    const parts = content.split('[SPLIT]');
    if (parts.length >= 2) {
      return {
        zh: parts[0]?.trim() || '',
        en: parts[1]?.trim() || ''
      };
    }
    return { zh: content, en: 'Analysis in progress...' };
  }

  if (content.includes('中文:') && content.includes('English:')) {
    const zhMatch = content.match(/中文:([\s\S]*?)English:/);
    const enMatch = content.match(/English:([\s\S]*)$/);
    const prefixMatch = content.match(/^([\s\S]*?)\n\n\[/);
    const suffixMatch = content.match(/\]\n中文:[\s\S]*?\n\n([\s\S]*)$/);

    const prefix = prefixMatch ? prefixMatch[1].trim() : "";
    const suffix = suffixMatch ? suffixMatch[1].trim() : "";

    return {
      zh: (prefix ? prefix + '\n\n' : '') + (zhMatch ? zhMatch[1].trim() : content) + (suffix ? '\n\n' + suffix : ''),
      en: (enMatch ? enMatch[1].trim() : content)
    };
  }

  return { zh: content, en: content };
};

interface MessageBubbleProps {
  m: ChatMessage;
  side: 'zh' | 'en';
  isSpeaking: boolean;
  onSpeak: (content: string) => void;
  onStop: () => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ m, side, isSpeaking, onSpeak, onStop }) => {
  const { zh, en } = parseMessage(m.content, m.role);
  const content = side === 'zh' ? zh : en;

  if (!content || content === 'Analysis in progress...') {
    if (m.role === 'assistant') {
       return (
         <div className="flex justify-start opacity-40 italic text-xs p-4">
           {side === 'zh' ? '正在整理中文解读...' : 'Synthesizing English commentary...'}
         </div>
       );
    }
  }

  return (
    <div className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
      <div className={`max-w-[95%] rounded-2xl p-4 shadow-sm border transition-all ${
        m.role === 'user' 
          ? 'bg-indigo-600 text-white border-transparent' 
          : 'bg-white text-slate-800 border-slate-200'
      }`}>
        <div className="flex justify-between items-start gap-2">
          <div className={`flex-1 overflow-hidden prose prose-sm sm:prose-base ${m.role === 'user' ? 'prose-invert text-white' : 'prose-slate'}`}>
            <ReactMarkdown 
              remarkPlugins={[remarkMath]} 
              rehypePlugins={[rehypeKatex]}
            >
              {content}
            </ReactMarkdown>
          </div>
          {m.role === 'assistant' && (
            <button 
              onClick={() => isSpeaking ? onStop() : onSpeak(content)} 
              className={`mt-1 shrink-0 transition-colors p-1 rounded-full ${isSpeaking ? 'bg-red-50 text-red-500' : 'text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50'}`} 
              title={isSpeaking ? (side === 'zh' ? "停止播放" : "Stop") : (side === 'zh' ? "朗读" : "Read aloud")}
            >
              {isSpeaking ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
              )}
            </button>
          )}
        </div>
        
        {m.mediaUrl && <div className="mt-2 group relative">
          {m.type === 'video' ? (
            <video src={m.mediaUrl} controls className="rounded-lg max-h-64 w-full object-contain border bg-slate-50 shadow-inner" />
          ) : (
            <img src={m.mediaUrl} className="rounded-lg max-h-64 w-full object-contain border bg-slate-50 shadow-inner" />
          )}
        </div>}

        {m.references && m.references.length > 0 && side === 'zh' && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">学术来源</p>
            <div className="flex flex-wrap gap-1">
              {m.references.slice(0, 4).map((r, i) => (
                <a key={i} href={r.uri} target="_blank" rel="noopener noreferrer" className="bg-slate-50 px-2 py-0.5 rounded border border-slate-100 text-[10px] text-indigo-600 truncate max-w-[140px] hover:bg-indigo-50 hover:border-indigo-100 transition-all">
                  {r.title}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ChatInterface: React.FC<ChatInterfaceProps> = ({ incomingText }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [userQuestion, setUserQuestion] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [showStudio, setShowStudio] = useState(false);
  const [vSplitOffset, setVSplitOffset] = useState(100); // Default to 100% - show only conversation, hide English panel
  const [isResizing, setIsResizing] = useState(false);
  const [speakingMsgIndex, setSpeakingMsgIndex] = useState<{zh?: number | null, en?: number | null}>({});
  const [studioConfig, setStudioConfig] = useState<{ aspect: AspectRatio; size: ImageSize; type: 'image' | 'video' }>({
    aspect: '1:1',
    size: '1K',
    type: 'image'
  });
  
  const containerRef = useRef<HTMLDivElement>(null);
  const zhScrollRef = useRef<HTMLDivElement>(null);
  const enScrollRef = useRef<HTMLDivElement>(null);
  const lastPayloadId = useRef<number>(-1);

  // Sync incoming verses while preserving the user's manual question
  useEffect(() => {
    if (incomingText && incomingText.id !== lastPayloadId.current) {
      lastPayloadId.current = incomingText.id;
      
      const verseText = incomingText.text.trim();
      if (!verseText) {
        setInput(userQuestion);
      } else {
        const prefix = "简介要点:\n\n";
        const suffix = userQuestion.trim() ? `\n\n我的额外问题是：\n${userQuestion}` : "";
        setInput(`${prefix}${verseText}${suffix}`);
      }
    }
  }, [incomingText, userQuestion]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    
    // Attempt to extract the "Manual Question" part if verses are present
    const verseEndIndex = val.lastIndexOf("WEB:");
    if (verseEndIndex !== -1) {
      const remaining = val.substring(verseEndIndex);
      const suffixMatch = remaining.match(/WEB:[\s\S]*?\n\n我的额外问题是：\n([\s\S]*)$/);
      if (suffixMatch) {
        setUserQuestion(suffixMatch[1]);
      } else if (!val.includes("简介要点:")) {
        setUserQuestion(val);
      }
    } else {
      setUserQuestion(val);
    }
  };

  const handleSpeak = (content: string, index: number, side: 'zh' | 'en') => {
    setSpeakingMsgIndex(prev => ({ ...prev, [side]: index }));
    aiService.speak(content, () => setSpeakingMsgIndex(prev => ({ ...prev, [side]: null })));
  };

  const handleStop = (side: 'zh' | 'en') => {
    aiService.stopSpeech();
    setSpeakingMsgIndex(prev => ({ ...prev, [side]: null }));
  };

  const syncScroll = (source: 'zh' | 'en') => {
    const src = source === 'zh' ? zhScrollRef.current : enScrollRef.current;
    const dest = source === 'zh' ? enScrollRef.current : zhScrollRef.current;
    if (src && dest) {
      dest.scrollTop = src.scrollTop;
    }
  };

  useEffect(() => {
    // Small delay to ensure DOM is updated
    const scrollTimeout = setTimeout(() => {
      if (zhScrollRef.current) {
        zhScrollRef.current.scrollTo({ top: zhScrollRef.current.scrollHeight, behavior: 'smooth' });
      }
      if (enScrollRef.current) {
        enScrollRef.current.scrollTo({ top: enScrollRef.current.scrollHeight, behavior: 'smooth' });
      }
    }, 100);
    return () => clearTimeout(scrollTimeout);
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMessage: ChatMessage = { role: 'user', content: input, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setUserQuestion(''); // Reset manual part after sending
    setIsTyping(true);
    
    // Immediate scroll to bottom after sending message
    setTimeout(() => {
      if (zhScrollRef.current) {
        zhScrollRef.current.scrollTo({ top: zhScrollRef.current.scrollHeight, behavior: 'smooth' });
      }
      if (enScrollRef.current) {
        enScrollRef.current.scrollTo({ top: enScrollRef.current.scrollHeight, behavior: 'smooth' });
      }
    }, 50);

    try {
      const history = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }));
      const response = await aiService.chatWithAI(currentInput, history, { 
        thinking: isThinking, 
        search: true,
        fast: !isThinking 
      });
      
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const references = Array.isArray(groundingChunks) 
        ? groundingChunks.map((chunk: any) => ({ title: chunk.web?.title || '参考资料', uri: chunk.web?.uri || '' })).filter((c: any) => c.uri)
        : undefined;

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.text || "我无法生成回应。",
        timestamp: new Date(),
        references: references
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: "连接失败，请重试。", timestamp: new Date() }]);
    } finally {
      setIsTyping(false);
    }
  };

  const startMediaGen = async () => {
    if (!input.trim()) return;
    setIsTyping(true);
    setShowStudio(false);
    try {
      if (studioConfig.type === 'image') {
        const url = await aiService.generateImage(input, studioConfig.aspect, studioConfig.size);
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `生成的图像：${input}\n[SPLIT]\nGenerated Image: ${input}`, 
          mediaUrl: url, 
          type: 'image', 
          timestamp: new Date() 
        }]);
      } else {
        const url = await aiService.generateVideo(input, studioConfig.aspect as any);
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `生成的视频：${input}\n[SPLIT]\nGenerated Video: ${input}`, 
          mediaUrl: url, 
          type: 'video', 
          timestamp: new Date() 
        }]);
      }
      setInput('');
      setUserQuestion('');
    } catch (err) { console.error(err); } finally { setIsTyping(false); }
  };

  const startResizing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => setIsResizing(false), []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const percentage = ((e.clientX - rect.left) / rect.width) * 100;
      if (percentage >= 0 && percentage <= 100) setVSplitOffset(percentage);
    }
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  return (
    <div className="h-full flex flex-col relative bg-slate-50" ref={containerRef}>
      <div className="flex-1 flex overflow-hidden relative">
        {/* Chinese Side */}
        <div 
          ref={zhScrollRef} 
          onScroll={() => syncScroll('zh')}
          className="overflow-y-auto p-4 space-y-6 border-r border-slate-200 bg-white"
          style={{ 
            flexGrow: vSplitOffset >= 100 ? 1 : 0,
            flexShrink: vSplitOffset >= 100 ? 1 : 0,
            flexBasis: vSplitOffset >= 100 ? 'calc(100% - 20px)' : vSplitOffset <= 0 ? '0%' : `calc(${vSplitOffset}% - 10px)`,
            minWidth: 0,
            display: vSplitOffset <= 0 ? 'none' : 'block'
          }}
        >
          <div className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-4 sticky top-0 bg-white/90 backdrop-blur-md z-10 py-2 flex items-center gap-2">
            <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
            中文解读 (Scholar Research)
          </div>
          {messages.map((m, idx) => (
            <MessageBubble 
              key={idx} 
              m={m} 
              side="zh" 
              isSpeaking={speakingMsgIndex.zh === idx} 
              onSpeak={(c) => handleSpeak(c, idx, 'zh')}
              onStop={() => handleStop('zh')}
            />
          ))}
          {isTyping && (
            <div className="flex justify-start">
               <div className="animate-pulse bg-slate-100 h-20 w-3/4 rounded-2xl border border-slate-200"></div>
            </div>
          )}
        </div>

        {/* Vertical Splitter */}
        <div 
          className={`relative h-full flex items-center justify-center select-none z-30 transition-all group hover:bg-blue-50 flex-shrink-0`}
          style={{ 
            width: '20px',
            marginLeft: '0',
            marginRight: '0',
            touchAction: 'none',
            WebkitTouchCallout: 'none',
            WebkitUserSelect: 'none',
            userSelect: 'none'
          }}
        >
          {/* Visible divider bar */}
          <div 
            className={`absolute h-full ${isResizing ? 'w-2 bg-indigo-500' : 'w-1 bg-slate-200 group-hover:bg-indigo-400 group-hover:w-2'} transition-all`}
            style={{
              boxShadow: isResizing ? '2px 0 4px rgba(99, 102, 241, 0.3), -2px 0 4px rgba(99, 102, 241, 0.3)' : '1px 0 2px rgba(0, 0, 0, 0.05)'
            }}
          />
          
          <div 
            onMouseDown={startResizing}
            className="absolute w-full h-full cursor-col-resize"
          />
          
          {/* Arrow buttons and drag indicator */}
          <div 
            className="relative flex flex-col gap-1 bg-white/95 py-1.5 px-1 rounded-full shadow-lg border border-slate-300 hover:border-blue-300 z-40 cursor-col-resize transition-colors" 
            style={{ width: '20px' }}
          >
            {/* Left arrow - toggle between middle (50%) and maximize English (0%) */}
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                // If on right side (>50%), go to middle (50%)
                // If at middle or left side (<=50%), maximize English (0%)
                setVSplitOffset(vSplitOffset > 50 ? 50 : 0);
              }}
              className="p-px hover:bg-slate-200 rounded transition-colors flex items-center justify-center group"
              title={vSplitOffset > 50 ? "Center divider" : "Maximize English"}
              style={{ height: '14px', width: '14px' }}
            >
              <svg className="w-3 h-3 text-slate-500 group-hover:text-slate-700 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            
            {/* Drag indicator */}
            <div 
              onMouseDown={startResizing}
              onTouchStart={startResizing}
              className="flex flex-row gap-0.5 px-1 justify-center cursor-col-resize" 
              style={{ width: '14px' }}
            >
              <div className="w-0.5 h-4 bg-slate-300 pointer-events-none"></div>
              <div className="w-0.5 h-4 bg-slate-300 pointer-events-none"></div>
            </div>
            
            {/* Right arrow - toggle between middle (50%) and maximize Chinese (100%) */}
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                // If on left side (<50%), go to middle (50%)
                // If at middle or right side (>=50%), maximize Chinese (100%)
                setVSplitOffset(vSplitOffset < 50 ? 50 : 100);
              }}
              className="p-px hover:bg-slate-200 rounded transition-colors flex items-center justify-center group"
              title={vSplitOffset < 50 ? "Center divider" : "Maximize Chinese"}
              style={{ height: '14px', width: '14px' }}
            >
              <svg className="w-3 h-3 text-slate-500 group-hover:text-slate-700 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* English Side */}
        <div 
          ref={enScrollRef} 
          onScroll={() => syncScroll('en')}
          className="overflow-y-auto p-4 space-y-6 bg-slate-50/50"
          style={{ 
            flexGrow: vSplitOffset <= 0 ? 1 : 0,
            flexShrink: vSplitOffset <= 0 ? 1 : 0,
            flexBasis: vSplitOffset <= 0 ? 'calc(100% - 20px)' : vSplitOffset >= 100 ? '0%' : `calc(${100 - vSplitOffset}% - 10px)`,
            minWidth: 0,
            display: vSplitOffset >= 100 ? 'none' : 'block'
          }}
        >
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 sticky top-0 bg-slate-50/90 backdrop-blur-md z-10 py-2 flex items-center gap-2">
            <span className="w-2 h-2 bg-slate-300 rounded-full"></span>
            English Commentary (Academic)
          </div>
          {messages.map((m, idx) => (
            <MessageBubble 
              key={idx} 
              m={m} 
              side="en" 
              isSpeaking={speakingMsgIndex.en === idx} 
              onSpeak={(c) => handleSpeak(c, idx, 'en')}
              onStop={() => handleStop('en')}
            />
          ))}
        </div>
      </div>

      {/* Studio & Input */}
      {showStudio && (
        <div className="absolute bottom-24 left-4 right-4 bg-white p-5 rounded-2xl shadow-2xl border border-indigo-100 z-50 animate-in zoom-in duration-200">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-bold text-slate-700 text-sm flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
              圣经影像工坊
            </h4>
            <button onClick={() => setShowStudio(false)} className="text-slate-400 hover:text-slate-600 p-1">
               <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="space-y-1">
              <span className="text-slate-400 font-bold ml-1">创作类型</span>
              <select className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" onChange={e => setStudioConfig({...studioConfig, type: e.target.value as any})}>
                <option value="image">超清图像 (Pro 4.0)</option>
                <option value="video">史诗视频 (Veo 3.1)</option>
              </select>
            </div>
            <div className="space-y-1">
              <span className="text-slate-400 font-bold ml-1">比例</span>
              <select className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" onChange={e => setStudioConfig({...studioConfig, aspect: e.target.value as any})}>
                <option value="1:1">1:1 正方形</option>
                <option value="16:9">16:9 宽屏</option>
                <option value="9:16">9:16 竖屏</option>
              </select>
            </div>
          </div>
          <button onClick={startMediaGen} className="w-full mt-4 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg hover:bg-indigo-700 active:scale-95 transition-all">生成视觉启发</button>
        </div>
      )}

      <div className="p-4 bg-white border-t border-slate-200 z-10 shadow-lg">
        <div className="max-w-5xl mx-auto flex flex-col gap-2">
          <div className="flex items-center gap-2 px-1">
            <button onClick={() => setIsThinking(!isThinking)} className={`p-1.5 rounded-lg transition-all ${isThinking ? 'bg-amber-100 text-amber-600 border border-amber-200' : 'bg-slate-100 text-slate-400 hover:text-indigo-500'}`} title="深度学术思考">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.989-2.386l-.548-.547z" /></svg>
            </button>
            <button onClick={() => setShowStudio(!showStudio)} className="p-1.5 bg-slate-100 text-slate-400 hover:text-indigo-500 rounded-lg transition-all" title="开启工坊">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </button>
            <div className="h-4 w-[1px] bg-slate-200 mx-1"></div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{isThinking ? 'Pro Deep Research' : 'Standard Analysis'}</span>
          </div>
          <div className="relative">
            <textarea
              value={input}
              onChange={handleInputChange}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="点击上方选择经文，或在此直接输入问题..."
              className="w-full p-3 pr-14 rounded-xl border border-slate-200 bg-slate-50 resize-none min-h-[80px] focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm shadow-inner transition-all"
              rows={3}
            />
            <button onClick={handleSend} disabled={!input.trim() || isTyping} className="absolute right-2 bottom-2 p-2.5 bg-indigo-600 text-white rounded-xl shadow-md disabled:bg-slate-300 transition-all active:scale-95">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;