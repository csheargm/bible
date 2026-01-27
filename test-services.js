// Test script to verify services are working
// Run this in browser console to test

async function testServices() {
  console.log('🧪 Starting Service Tests...\n');
  
  // Test 1: Reading History Service
  console.log('📚 Test 1: Reading History Service');
  try {
    // Save last read
    readingHistory.saveLastRead('john', 'John', 3);
    
    // Get last read
    const lastRead = readingHistory.getLastRead();
    if (lastRead && lastRead.bookId === 'john' && lastRead.chapter === 3) {
      console.log('✅ Reading history save/load works');
    } else {
      console.log('❌ Reading history save/load failed');
    }
    
    // Add to history
    await readingHistory.addToHistory('john', 'John', 3, true, false);
    const history = await readingHistory.getRecentHistory(5);
    console.log('✅ History entries:', history.length);
  } catch (e) {
    console.error('❌ Reading history error:', e);
  }
  
  // Test 2: Verse Data Storage
  console.log('\n📝 Test 2: Verse Data Storage');
  try {
    // Save a personal note
    await verseDataStorage.savePersonalNote('john', 3, [16], {
      text: 'Test note for John 3:16',
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    
    // Get the note back
    const verseData = await verseDataStorage.getVerseData('john', 3, [16]);
    if (verseData && verseData.personalNote) {
      console.log('✅ Personal note saved and retrieved');
    } else {
      console.log('❌ Personal note save/retrieve failed');
    }
    
    // Add AI research
    const researchId = await verseDataStorage.addAIResearch('john', 3, [16], {
      query: 'What does this verse mean?',
      response: 'Test AI response',
      tags: ['salvation', 'love']
    });
    console.log('✅ AI research added with ID:', researchId);
    
    // Search notes
    const searchResults = await verseDataStorage.searchNotes('Test note');
    console.log('✅ Search found', searchResults.length, 'results');
  } catch (e) {
    console.error('❌ Verse data storage error:', e);
  }
  
  // Test 3: Export/Import Service
  console.log('\n💾 Test 3: Export/Import Service');
  try {
    // Export to JSON
    const jsonExport = await exportImportService.exportToJSON();
    const exportData = JSON.parse(jsonExport);
    console.log('✅ Export created with', Object.keys(exportData.data).length, 'entries');
    
    // Test import (dry run)
    const importResult = await exportImportService.importFromJSON(jsonExport, 'skip_existing');
    console.log('✅ Import test:', importResult);
  } catch (e) {
    console.error('❌ Export/Import error:', e);
  }
  
  // Test 4: Check UI Components
  console.log('\n🎨 Test 4: UI Components Check');
  
  // Check for Reading History button
  const historyButton = document.querySelector('button[title="阅读历史"]');
  console.log(historyButton ? '✅ History button found' : '❌ History button not found');
  
  // Check for chapter dropdown indicators
  const chapterSelect = document.querySelector('select option');
  if (chapterSelect && chapterSelect.textContent.includes('📝')) {
    console.log('✅ Chapter indicators working');
  } else {
    console.log('⚠️ No chapter indicators visible (may need notes first)');
  }
  
  // Check if app loaded to last position
  const resumeNotification = localStorage.getItem('bible_last_read');
  if (resumeNotification) {
    const lastRead = JSON.parse(resumeNotification);
    console.log('✅ Last read stored:', lastRead.bookName, lastRead.chapter);
  }
  
  console.log('\n✨ Service Tests Complete!');
  console.log('Check browser for visual testing of UI components');
}

// Instructions for manual testing
console.log(`
📋 MANUAL TEST INSTRUCTIONS:
1. Copy and paste this entire script into browser console
2. Run: testServices()
3. Check the console output for test results

VISUAL TESTS TO PERFORM:
1. Click the 📚 button to see reading history
2. Navigate to different chapters and refresh
3. Add a note to a verse and check indicators
4. Select text to see context menu
5. Test export functionality
`);

// Make functions available globally for testing
window.testServices = testServices;