/**
 * Seasonal Theme Service
 * Changes the Bible app's look and feel based on the current season.
 * 
 * 🌸 Spring (Mar-May): Fresh greens, cherry blossom pinks, renewal
 * ☀️ Summer (Jun-Aug): Warm golden tones, vibrant life
 * 🍂 Autumn (Sep-Nov): Rich amber, warm oranges, harvest warmth
 * ❄️ Winter (Dec-Feb): Cool serene blues, peaceful whites
 */

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export interface SeasonTheme {
  season: Season;
  name: string;       // Display name
  nameZh: string;     // Chinese name
  emoji: string;
  
  // Core colors
  background: string;        // Page background
  backgroundAlt: string;     // Slightly different bg for cards/sections
  accent: string;            // Primary accent (replaces indigo-600)
  accentLight: string;       // Light accent (replaces indigo-50/100)
  accentMedium: string;      // Medium accent (replaces indigo-200/300)
  accentText: string;        // Text on accent bg
  accentDark: string;        // Darker accent for hover states
  
  // Sidebar
  sidebarHeader: string;     // Sidebar header icon bg
  
  // Verse highlights
  verseHighlight: string;    // Selected verse bg
  verseBorder: string;       // Selected verse border
  
  // Divider
  dividerActive: string;     // Active resize divider
  dividerShadow: string;     // Divider shadow color
  
  // Bookmark heart
  heartColor: string;
  
  // Subtle gradient overlay (optional decorative touch)
  gradientFrom: string;
  gradientTo: string;
  
  // Bible reading area (paper-like background)
  paperBg: string;
  paperGradient: string;      // CSS background-image gradient
  paperShadow: string;        // CSS inset box-shadow
}

export function getSeason(date: Date = new Date()): Season {
  const month = date.getMonth(); // 0-indexed
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

const THEMES: Record<Season, SeasonTheme> = {
  spring: {
    season: 'spring',
    name: 'Spring',
    nameZh: '春',
    emoji: '🌸',
    
    background: '#F4FAF0',
    backgroundAlt: '#EDF7E8',
    accent: '#4A9E5C',
    accentLight: '#E8F5EA',
    accentMedium: '#A8D5B0',
    accentText: '#FFFFFF',
    accentDark: '#3A8549',
    
    sidebarHeader: '#4A9E5C',
    
    verseHighlight: '#E8F5EA',
    verseBorder: '#A8D5B0',
    
    dividerActive: '#4A9E5C',
    dividerShadow: 'rgba(74, 158, 92, 0.3)',
    
    heartColor: '#E879A0',
    
    gradientFrom: 'rgba(232, 245, 234, 0.3)',
    gradientTo: 'rgba(244, 250, 240, 0)',
    
    paperBg: '#F0F8EC',
    paperGradient: `
      linear-gradient(180deg, #F8FDF5 0%, #EEF7E8 50%, #E8F2E2 100%),
      radial-gradient(ellipse at top left, rgba(200, 235, 190, 0.4) 0%, transparent 50%),
      radial-gradient(ellipse at bottom right, rgba(180, 225, 170, 0.3) 0%, transparent 50%)
    `,
    paperShadow: `
      inset 0 0 60px rgba(180, 225, 170, 0.25),
      inset 0 0 30px rgba(200, 235, 190, 0.15),
      inset 2px 2px 5px rgba(0, 0, 0, 0.02)
    `,
  },
  
  summer: {
    season: 'summer',
    name: 'Summer',
    nameZh: '夏',
    emoji: '☀️',
    
    background: '#FFFBF0',
    backgroundAlt: '#FFF5E0',
    accent: '#D4870E',
    accentLight: '#FFF3DB',
    accentMedium: '#F5D58E',
    accentText: '#FFFFFF',
    accentDark: '#B8720A',
    
    sidebarHeader: '#D4870E',
    
    verseHighlight: '#FFF3DB',
    verseBorder: '#F5D58E',
    
    dividerActive: '#D4870E',
    dividerShadow: 'rgba(212, 135, 14, 0.3)',
    
    heartColor: '#E8524A',
    
    gradientFrom: 'rgba(255, 243, 219, 0.3)',
    gradientTo: 'rgba(255, 251, 240, 0)',
    
    paperBg: '#FDF8F0',
    paperGradient: `
      linear-gradient(180deg, #FFFEF9 0%, #FDF6E8 50%, #FAF3E5 100%),
      radial-gradient(ellipse at top left, rgba(252, 243, 223, 0.4) 0%, transparent 50%),
      radial-gradient(ellipse at bottom right, rgba(249, 235, 195, 0.3) 0%, transparent 50%)
    `,
    paperShadow: `
      inset 0 0 60px rgba(245, 225, 185, 0.25),
      inset 0 0 30px rgba(249, 235, 195, 0.15),
      inset 2px 2px 5px rgba(0, 0, 0, 0.02)
    `,
  },
  
  autumn: {
    season: 'autumn',
    name: 'Autumn',
    nameZh: '秋',
    emoji: '🍂',
    
    background: '#FBF6EE',
    backgroundAlt: '#F5ECE0',
    accent: '#C06B2D',
    accentLight: '#FAEADE',
    accentMedium: '#E8B889',
    accentText: '#FFFFFF',
    accentDark: '#A35822',
    
    sidebarHeader: '#C06B2D',
    
    verseHighlight: '#FAEADE',
    verseBorder: '#E8B889',
    
    dividerActive: '#C06B2D',
    dividerShadow: 'rgba(192, 107, 45, 0.3)',
    
    heartColor: '#D45B4E',
    
    gradientFrom: 'rgba(250, 234, 222, 0.3)',
    gradientTo: 'rgba(251, 246, 238, 0)',
    
    paperBg: '#FAF0E4',
    paperGradient: `
      linear-gradient(180deg, #FEF8F0 0%, #F8EBDA 50%, #F2E2CC 100%),
      radial-gradient(ellipse at top left, rgba(245, 210, 165, 0.4) 0%, transparent 50%),
      radial-gradient(ellipse at bottom right, rgba(240, 200, 150, 0.3) 0%, transparent 50%)
    `,
    paperShadow: `
      inset 0 0 60px rgba(235, 195, 140, 0.25),
      inset 0 0 30px rgba(240, 200, 150, 0.15),
      inset 2px 2px 5px rgba(0, 0, 0, 0.02)
    `,
  },
  
  winter: {
    season: 'winter',
    name: 'Winter',
    nameZh: '冬',
    emoji: '❄️',
    
    background: '#F3F6FB',
    backgroundAlt: '#E8EDF5',
    accent: '#4A6FA5',
    accentLight: '#E0E9F5',
    accentMedium: '#A4BCE0',
    accentText: '#FFFFFF',
    accentDark: '#3A5A8A',
    
    sidebarHeader: '#4A6FA5',
    
    verseHighlight: '#E0E9F5',
    verseBorder: '#A4BCE0',
    
    dividerActive: '#4A6FA5',
    dividerShadow: 'rgba(74, 111, 165, 0.3)',
    
    heartColor: '#C06080',
    
    gradientFrom: 'rgba(224, 233, 245, 0.3)',
    gradientTo: 'rgba(243, 246, 251, 0)',
    
    paperBg: '#EBF0F8',
    paperGradient: `
      linear-gradient(180deg, #F5F8FD 0%, #E8EFF8 50%, #E0E8F3 100%),
      radial-gradient(ellipse at top left, rgba(190, 210, 240, 0.4) 0%, transparent 50%),
      radial-gradient(ellipse at bottom right, rgba(180, 200, 235, 0.3) 0%, transparent 50%)
    `,
    paperShadow: `
      inset 0 0 60px rgba(180, 200, 235, 0.25),
      inset 0 0 30px rgba(190, 210, 240, 0.15),
      inset 2px 2px 5px rgba(0, 0, 0, 0.02)
    `,
  },
};

export const ALL_SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];

const STORAGE_KEY = 'bible-app-season-override';

/**
 * Get the user's saved theme preference, or null for auto-detect.
 */
export function getSavedSeasonOverride(): Season | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && ALL_SEASONS.includes(saved as Season)) {
      return saved as Season;
    }
  } catch {}
  return null;
}

/**
 * Save a manual season override. Pass null to revert to auto-detect.
 */
export function saveSeasonOverride(season: Season | null): void {
  try {
    if (season === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, season);
    }
  } catch {}
}

export function getSeasonTheme(date?: Date): SeasonTheme {
  const override = getSavedSeasonOverride();
  if (override) return THEMES[override];
  return THEMES[getSeason(date)];
}

export function getThemeForSeason(season: Season): SeasonTheme {
  return THEMES[season];
}

/**
 * Apply theme as CSS custom properties on the document root.
 * This allows components to use var(--theme-accent) etc.
 */
export function applyThemeToDOM(theme: SeasonTheme): void {
  const root = document.documentElement;
  root.style.setProperty('--theme-bg', theme.background);
  root.style.setProperty('--theme-bg-alt', theme.backgroundAlt);
  root.style.setProperty('--theme-accent', theme.accent);
  root.style.setProperty('--theme-accent-light', theme.accentLight);
  root.style.setProperty('--theme-accent-medium', theme.accentMedium);
  root.style.setProperty('--theme-accent-text', theme.accentText);
  root.style.setProperty('--theme-accent-dark', theme.accentDark);
  root.style.setProperty('--theme-heart', theme.heartColor);
  root.style.setProperty('--theme-verse-highlight', theme.verseHighlight);
  root.style.setProperty('--theme-verse-border', theme.verseBorder);
  root.style.setProperty('--theme-divider-active', theme.dividerActive);
  root.style.setProperty('--theme-divider-shadow', theme.dividerShadow);
  root.style.setProperty('--theme-gradient-from', theme.gradientFrom);
  root.style.setProperty('--theme-gradient-to', theme.gradientTo);
  
  // Override the hardcoded body background so theme shows everywhere
  document.body.style.backgroundColor = theme.background;
}
