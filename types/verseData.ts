export interface MediaAttachment {
  id: string;
  type: 'image' | 'audio' | 'video';
  data: string; // base64 encoded
  thumbnail?: string;
  caption?: string;
  timestamp: number;
}

export interface PersonalNote {
  text: string;
  drawing?: string;
  media?: MediaAttachment[];
  createdAt: number;
  updatedAt: number;
}

export interface AIResearchEntry {
  id: string;
  query: string;
  response: string;
  selectedText?: string;
  timestamp: number;
  tags?: string[];
  highlighted?: string[]; // Array of highlighted text within the response
}

export interface VerseData {
  id: string; // "bookId_chapter_verse"
  bookId: string;
  chapter: number;
  verses: number[];
  
  personalNote?: PersonalNote;
  aiResearch: AIResearchEntry[];
}

export interface VerseDataDB {
  verseData: VerseData[];
}