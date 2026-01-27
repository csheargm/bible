# Bible App Feature Testing Checklist

## ✅ Phase 1: Reading History & Auto-Load
- [ ] **Test 1**: Navigate to a specific chapter (e.g., John 3)
- [ ] **Test 2**: Refresh the page - should return to John 3
- [ ] **Test 3**: Click the 📚 History button - should show reading history
- [ ] **Test 4**: Check chapter dropdown - should show indicators for chapters with notes

## ✅ Phase 2: Separated Notes & AI Research
- [ ] **Test 5**: Check if EnhancedNotebook component loads
- [ ] **Test 6**: Verify tabs (My Notes | AI Research | All) are present
- [ ] **Test 7**: Test timeline view in "All" tab

## ✅ Phase 3: Reading Mode Interactions  
- [ ] **Test 8**: Hover over verses with notes - should show preview
- [ ] **Test 9**: Select text - should show context menu
- [ ] **Test 10**: Context menu should have "Research with AI", "Add to Notes", "Copy"

## ✅ Phase 4: AI Research Integration
- [ ] **Test 11**: Check SaveResearchModal component
- [ ] **Test 12**: Verify research can be saved to verses
- [ ] **Test 13**: Test research tagging system

## ✅ Phase 5: Export/Import
- [ ] **Test 14**: Export notes as JSON
- [ ] **Test 15**: Export notes as Markdown
- [ ] **Test 16**: Test import functionality
- [ ] **Test 17**: Verify merge strategies work

## ✅ Phase 6: Enhanced Search
- [ ] **Test 18**: Search in notes
- [ ] **Test 19**: Search in AI research
- [ ] **Test 20**: Verify search results display

## ✅ Phase 7: Mobile Optimization
- [ ] **Test 21**: Test on mobile viewport
- [ ] **Test 22**: Check responsive design
- [ ] **Test 23**: Test touch interactions

## Test Results Summary
- **Total Tests**: 23
- **Passed**: _
- **Failed**: _
- **Blocked**: _

## Issues Found
1. Navigation bug was fixed - app should now load last read position
2. _Add any issues found during testing_