# Template → Project Refactoring Plan

## Executive Summary
Refactor all references from "Template" to "Project" where they refer to saved certificate configurations, while preserving legitimate uses of "template" (email templates, image templates, format templates).

## Scope Analysis

### Files That Need Refactoring (8 core files + tests)

#### Core Implementation Files
1. **lib/template-storage.ts** → **lib/project-storage.ts**
   - `SavedTemplate` → `SavedProject`
   - `TemplateListItem` → `ProjectListItem`  
   - `STORAGE_KEY_PREFIX = 'bamboobot_template_v1_'` → `'bamboobot_project_v1_'`
   - All function names: `saveTemplate()` → `saveProject()`, etc.

2. **hooks/useTemplateManagement.tsx** → **hooks/useProjectManagement.tsx**
   - Hook name: `useTemplateManagement` → `useProjectManagement`
   - State variables: `templates` → `projects`, `selectedTemplate` → `selectedProject`
   - Function names: `loadTemplate()` → `loadProject()`, etc.

3. **components/modals/SaveTemplateModal.tsx** → **components/modals/SaveProjectModal.tsx**
   - Component name and all internal references
   - UI text: "Save Template" → "Save Project"

4. **components/modals/LoadTemplateModal.tsx** → **components/modals/LoadProjectModal.tsx**
   - Component name and all internal references
   - UI text: "Load Template" → "Load Project"

5. **pages/index.tsx**
   - Import statements and hook usage
   - Variable names referencing templates → projects

#### Test Files (High Impact!)
6. **__tests__/lib/template-storage.test.ts** → **__tests__/lib/project-storage.test.ts**
7. **__tests__/lib/template-storage-recent.test.ts** → **__tests__/lib/project-storage-recent.test.ts**
8. **__tests__/components/modals/SaveTemplateModal.test.tsx** → **__tests__/components/modals/SaveProjectModal.test.tsx**
9. **__tests__/components/modals/LoadTemplateModal.test.tsx** → **__tests__/components/modals/LoadProjectModal.test.tsx**
10. **__tests__/hooks/useTemplateAutosave.test.ts** → **__tests__/hooks/useProjectAutosave.test.ts**

### Files That Should NOT Change

#### Legitimate "template" uses (preserve these):
1. **lib/email-templates.ts** - Email HTML templates
2. **lib/email/email-queue.ts** - "Build email content from template"
3. **pages/api/files/template_images/[filename].ts** - Template images endpoint
4. **Format templates** - References to formatting presets
5. **Certificate templates** - When referring to the background image itself

## Migration Strategy

### Phase 1: Create Parallel Implementation
1. Copy files with new names (don't delete old ones yet)
2. Update all references in new files
3. Test new implementation in parallel

### Phase 2: Update Core Usage
1. Update pages/index.tsx to use new hooks/components
2. Update all imports across the codebase
3. Run full test suite

### Phase 3: Cleanup
1. Delete old files
2. Update documentation
3. Add migration for localStorage keys

## localStorage Migration

Need to handle existing data:
```javascript
// Migration function to preserve user data
function migrateTemplateStorage() {
  const oldPrefix = 'bamboobot_template_v1_';
  const newPrefix = 'bamboobot_project_v1_';
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(oldPrefix)) {
      const data = localStorage.getItem(key);
      const newKey = key.replace(oldPrefix, newPrefix);
      localStorage.setItem(newKey, data);
      // Keep old key temporarily for rollback capability
    }
  }
}
```

## Risk Assessment

### High Risk Areas:
1. **Tests** - 40+ test cases reference "template" - must update carefully
2. **localStorage** - Users have existing saved data that must migrate
3. **Component props** - May have external dependencies

### Medium Risk:
1. **E2E tests** - May have hardcoded selectors
2. **Documentation** - README, CLAUDE.md references

### Low Risk:
1. **UI text** - User-facing strings are straightforward to update

## Testing Plan

1. Create comprehensive test for migration function
2. Test localStorage migration with real data
3. Run full test suite after each phase
4. Manual QA of save/load functionality
5. Test with existing saved templates

## Rollback Plan

If issues arise:
1. Git revert to previous commit
2. Keep parallel implementations temporarily
3. localStorage dual-read (check both prefixes)

## Estimated Effort

- Core refactoring: 2-3 hours
- Test updates: 2-3 hours  
- Migration & testing: 1-2 hours
- Total: ~6-8 hours

## Next Steps

1. Create feature branch: `refactor/template-to-project`
2. Start with Phase 1 (parallel implementation)
3. Extensive testing before removing old code
4. Consider feature flag for gradual rollout