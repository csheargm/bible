import { openDB, DBSchema, IDBPDatabase } from 'idb';

export type PlanType = 'bible-in-year' | 'nt-90-days' | 'psalms-proverbs';

export interface ReadingPlanDay {
  bookId: string;
  bookName: string;
  chapter: number;
}

export interface ReadingPlanState {
  id: string; // plan type
  planType: PlanType;
  startDate: string; // ISO date string
  completedDays: string[]; // ISO date strings of completed days
  currentDay: number; // 0-indexed day number
  active: boolean;
}

interface ReadingPlanDB extends DBSchema {
  plans: {
    key: string;
    value: ReadingPlanState;
  };
}

// Generate reading plan schedules
function generateBibleInYearPlan(): ReadingPlanDay[][] {
  // A simplified Bible-in-a-Year plan: ~3-4 chapters per day across 365 days
  const allChapters: ReadingPlanDay[] = [];
  const books = [
    { id: 'GEN', name: '创世记 Genesis', chapters: 50 },
    { id: 'EXO', name: '出埃及记 Exodus', chapters: 40 },
    { id: 'LEV', name: '利未记 Leviticus', chapters: 27 },
    { id: 'NUM', name: '民数记 Numbers', chapters: 36 },
    { id: 'DEU', name: '申命记 Deuteronomy', chapters: 34 },
    { id: 'JOS', name: '约书亚记 Joshua', chapters: 24 },
    { id: 'JDG', name: '士师记 Judges', chapters: 21 },
    { id: 'RUT', name: '路得记 Ruth', chapters: 4 },
    { id: '1SA', name: '撒母耳记上 1 Samuel', chapters: 31 },
    { id: '2SA', name: '撒母耳记下 2 Samuel', chapters: 24 },
    { id: '1KI', name: '列王纪上 1 Kings', chapters: 22 },
    { id: '2KI', name: '列王纪下 2 Kings', chapters: 25 },
    { id: '1CH', name: '历代志上 1 Chronicles', chapters: 29 },
    { id: '2CH', name: '历代志下 2 Chronicles', chapters: 36 },
    { id: 'EZR', name: '以斯拉记 Ezra', chapters: 10 },
    { id: 'NEH', name: '尼希米记 Nehemiah', chapters: 13 },
    { id: 'EST', name: '以斯帖记 Esther', chapters: 10 },
    { id: 'JOB', name: '约伯记 Job', chapters: 42 },
    { id: 'PSA', name: '诗篇 Psalms', chapters: 150 },
    { id: 'PRO', name: '箴言 Proverbs', chapters: 31 },
    { id: 'ECC', name: '传道书 Ecclesiastes', chapters: 12 },
    { id: 'SNG', name: '雅歌 Song of Solomon', chapters: 8 },
    { id: 'ISA', name: '以赛亚书 Isaiah', chapters: 66 },
    { id: 'JER', name: '耶利米书 Jeremiah', chapters: 52 },
    { id: 'LAM', name: '耶利米哀歌 Lamentations', chapters: 5 },
    { id: 'EZK', name: '以西结书 Ezekiel', chapters: 48 },
    { id: 'DAN', name: '但以理书 Daniel', chapters: 12 },
    { id: 'HOS', name: '何西阿书 Hosea', chapters: 14 },
    { id: 'JOE', name: '约珥书 Joel', chapters: 3 },
    { id: 'AMO', name: '阿摩司书 Amos', chapters: 9 },
    { id: 'OBA', name: '俄巴底亚书 Obadiah', chapters: 1 },
    { id: 'JON', name: '约拿书 Jonah', chapters: 4 },
    { id: 'MIC', name: '弥迦书 Micah', chapters: 7 },
    { id: 'NAM', name: '那鸿书 Nahum', chapters: 3 },
    { id: 'HAB', name: '哈巴谷书 Habakkuk', chapters: 3 },
    { id: 'ZEP', name: '西番雅书 Zephaniah', chapters: 3 },
    { id: 'HAG', name: '哈该书 Haggai', chapters: 2 },
    { id: 'ZEC', name: '撒迦利亚书 Zechariah', chapters: 14 },
    { id: 'MAL', name: '玛拉基书 Malachi', chapters: 4 },
    { id: 'MAT', name: '马太福音 Matthew', chapters: 28 },
    { id: 'MRK', name: '马可福音 Mark', chapters: 16 },
    { id: 'LUK', name: '路加福音 Luke', chapters: 24 },
    { id: 'JHN', name: '约翰福音 John', chapters: 21 },
    { id: 'ACT', name: '使徒行传 Acts', chapters: 28 },
    { id: 'ROM', name: '罗马书 Romans', chapters: 16 },
    { id: '1CO', name: '哥林多前书 1 Corinthians', chapters: 16 },
    { id: '2CO', name: '哥林多后书 2 Corinthians', chapters: 13 },
    { id: 'GAL', name: '加拉太书 Galatians', chapters: 6 },
    { id: 'EPH', name: '以弗所书 Ephesians', chapters: 6 },
    { id: 'PHP', name: '腓立比书 Philippians', chapters: 4 },
    { id: 'COL', name: '歌罗西书 Colossians', chapters: 4 },
    { id: '1TH', name: '帖撒罗尼迦前书 1 Thessalonians', chapters: 5 },
    { id: '2TH', name: '帖撒罗尼迦后书 2 Thessalonians', chapters: 3 },
    { id: '1TI', name: '提摩太前书 1 Timothy', chapters: 6 },
    { id: '2TI', name: '提摩太后书 2 Timothy', chapters: 4 },
    { id: 'TIT', name: '提多书 Titus', chapters: 3 },
    { id: 'PHM', name: '腓利门书 Philemon', chapters: 1 },
    { id: 'HEB', name: '希伯来书 Hebrews', chapters: 13 },
    { id: 'JAS', name: '雅各书 James', chapters: 5 },
    { id: '1PE', name: '彼得前书 1 Peter', chapters: 5 },
    { id: '2PE', name: '彼得后书 2 Peter', chapters: 3 },
    { id: '1JN', name: '约翰一书 1 John', chapters: 5 },
    { id: '2JN', name: '约翰二书 2 John', chapters: 1 },
    { id: '3JN', name: '约翰三书 3 John', chapters: 1 },
    { id: 'JUD', name: '犹大书 Jude', chapters: 1 },
    { id: 'REV', name: '启示录 Revelation', chapters: 22 },
  ];

  for (const book of books) {
    for (let ch = 1; ch <= book.chapters; ch++) {
      allChapters.push({ bookId: book.id, bookName: book.name, chapter: ch });
    }
  }

  // Split into 365 days (~3-4 chapters per day)
  const totalChapters = allChapters.length; // 1189 chapters
  const days: ReadingPlanDay[][] = [];
  const chaptersPerDay = Math.ceil(totalChapters / 365);
  
  for (let i = 0; i < totalChapters; i += chaptersPerDay) {
    days.push(allChapters.slice(i, i + chaptersPerDay));
  }

  return days;
}

function generateNT90DaysPlan(): ReadingPlanDay[][] {
  const ntBooks = [
    { id: 'MAT', name: '马太福音 Matthew', chapters: 28 },
    { id: 'MRK', name: '马可福音 Mark', chapters: 16 },
    { id: 'LUK', name: '路加福音 Luke', chapters: 24 },
    { id: 'JHN', name: '约翰福音 John', chapters: 21 },
    { id: 'ACT', name: '使徒行传 Acts', chapters: 28 },
    { id: 'ROM', name: '罗马书 Romans', chapters: 16 },
    { id: '1CO', name: '哥林多前书 1 Corinthians', chapters: 16 },
    { id: '2CO', name: '哥林多后书 2 Corinthians', chapters: 13 },
    { id: 'GAL', name: '加拉太书 Galatians', chapters: 6 },
    { id: 'EPH', name: '以弗所书 Ephesians', chapters: 6 },
    { id: 'PHP', name: '腓立比书 Philippians', chapters: 4 },
    { id: 'COL', name: '歌罗西书 Colossians', chapters: 4 },
    { id: '1TH', name: '帖撒罗尼迦前书 1 Thessalonians', chapters: 5 },
    { id: '2TH', name: '帖撒罗尼迦后书 2 Thessalonians', chapters: 3 },
    { id: '1TI', name: '提摩太前书 1 Timothy', chapters: 6 },
    { id: '2TI', name: '提摩太后书 2 Timothy', chapters: 4 },
    { id: 'TIT', name: '提多书 Titus', chapters: 3 },
    { id: 'PHM', name: '腓利门书 Philemon', chapters: 1 },
    { id: 'HEB', name: '希伯来书 Hebrews', chapters: 13 },
    { id: 'JAS', name: '雅各书 James', chapters: 5 },
    { id: '1PE', name: '彼得前书 1 Peter', chapters: 5 },
    { id: '2PE', name: '彼得后书 2 Peter', chapters: 3 },
    { id: '1JN', name: '约翰一书 1 John', chapters: 5 },
    { id: '2JN', name: '约翰二书 2 John', chapters: 1 },
    { id: '3JN', name: '约翰三书 3 John', chapters: 1 },
    { id: 'JUD', name: '犹大书 Jude', chapters: 1 },
    { id: 'REV', name: '启示录 Revelation', chapters: 22 },
  ];

  const allChapters: ReadingPlanDay[] = [];
  for (const book of ntBooks) {
    for (let ch = 1; ch <= book.chapters; ch++) {
      allChapters.push({ bookId: book.id, bookName: book.name, chapter: ch });
    }
  }

  const totalChapters = allChapters.length; // 260 chapters
  const days: ReadingPlanDay[][] = [];
  const chaptersPerDay = Math.ceil(totalChapters / 90);
  
  for (let i = 0; i < totalChapters; i += chaptersPerDay) {
    days.push(allChapters.slice(i, i + chaptersPerDay));
  }

  return days;
}

function generatePsalmsProverbsPlan(): ReadingPlanDay[][] {
  // Psalms (150 chapters) + Proverbs (31 chapters) spread over 30 days
  const allChapters: ReadingPlanDay[] = [];
  
  // Psalms
  for (let ch = 1; ch <= 150; ch++) {
    allChapters.push({ bookId: 'PSA', bookName: '诗篇 Psalms', chapter: ch });
  }
  // Proverbs
  for (let ch = 1; ch <= 31; ch++) {
    allChapters.push({ bookId: 'PRO', bookName: '箴言 Proverbs', chapter: ch });
  }

  const totalChapters = allChapters.length; // 181
  const days: ReadingPlanDay[][] = [];
  const chaptersPerDay = Math.ceil(totalChapters / 30);
  
  for (let i = 0; i < totalChapters; i += chaptersPerDay) {
    days.push(allChapters.slice(i, i + chaptersPerDay));
  }

  return days;
}

export const READING_PLANS: Record<PlanType, {
  name: string;
  nameEn: string;
  description: string;
  totalDays: number;
  generate: () => ReadingPlanDay[][];
}> = {
  'bible-in-year': {
    name: '一年读经计划',
    nameEn: 'Bible in a Year',
    description: '每天3-4章，一年读完全部圣经',
    totalDays: 365,
    generate: generateBibleInYearPlan,
  },
  'nt-90-days': {
    name: '90天新约计划',
    nameEn: 'New Testament in 90 Days',
    description: '每天约3章，90天读完新约',
    totalDays: 90,
    generate: generateNT90DaysPlan,
  },
  'psalms-proverbs': {
    name: '诗篇箴言月读',
    nameEn: 'Psalms & Proverbs Monthly',
    description: '每天约6章，一个月读完诗篇和箴言',
    totalDays: 30,
    generate: generatePsalmsProverbsPlan,
  },
};

class ReadingPlanStorageService {
  private dbPromise: Promise<IDBPDatabase<ReadingPlanDB>>;

  constructor() {
    this.dbPromise = openDB<ReadingPlanDB>('BibleReadingPlanDB', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('plans')) {
          db.createObjectStore('plans', { keyPath: 'id' });
        }
      },
    });
  }

  async getActivePlan(): Promise<ReadingPlanState | null> {
    const db = await this.dbPromise;
    const all = await db.getAll('plans');
    return all.find(p => p.active) || null;
  }

  async startPlan(planType: PlanType): Promise<ReadingPlanState> {
    const db = await this.dbPromise;
    
    // Deactivate all existing plans
    const all = await db.getAll('plans');
    for (const plan of all) {
      if (plan.active) {
        plan.active = false;
        await db.put('plans', plan);
      }
    }

    const newPlan: ReadingPlanState = {
      id: planType,
      planType,
      startDate: new Date().toISOString().split('T')[0],
      completedDays: [],
      currentDay: 0,
      active: true,
    };

    await db.put('plans', newPlan);
    return newPlan;
  }

  async markDayComplete(planType: PlanType): Promise<void> {
    const db = await this.dbPromise;
    const plan = await db.get('plans', planType);
    if (!plan) return;

    const today = new Date().toISOString().split('T')[0];
    if (!plan.completedDays.includes(today)) {
      plan.completedDays.push(today);
    }
    
    // Advance current day
    const planDef = READING_PLANS[planType];
    if (plan.currentDay < planDef.totalDays - 1) {
      plan.currentDay++;
    }

    await db.put('plans', plan);
  }

  async stopPlan(planType: PlanType): Promise<void> {
    const db = await this.dbPromise;
    const plan = await db.get('plans', planType);
    if (plan) {
      plan.active = false;
      await db.put('plans', plan);
    }
  }

  getTodaysReading(plan: ReadingPlanState): ReadingPlanDay[] {
    const planDef = READING_PLANS[plan.planType];
    const schedule = planDef.generate();
    const dayIndex = Math.min(plan.currentDay, schedule.length - 1);
    return schedule[dayIndex] || [];
  }

  getProgress(plan: ReadingPlanState): number {
    const planDef = READING_PLANS[plan.planType];
    return Math.round((plan.completedDays.length / planDef.totalDays) * 100);
  }
}

export const readingPlanStorage = new ReadingPlanStorageService();
