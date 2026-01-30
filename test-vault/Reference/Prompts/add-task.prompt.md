---
name: Add Task
description: Add a new task to the current document with proper formatting
argument-hint: Describe the task to add (e.g., "Review PR by Friday")
---
Add a new task to the current document.

## Current Document
**File:** ${fileBasename}
**Location:** ${fileDirname}

## Current Content
${activeNoteContent}

---

## Instructions

Based on any additional context I provide, please:

1. **Analyze the document** - Identify where tasks are typically placed (look for existing task sections, TODO headers, or checkbox patterns)

2. **Create the task** using Obsidian task format:
   ```
   - [ ] Task description #tag @context 📅 YYYY-MM-DD
   ```

3. **Suggest placement** - Recommend where in the document the task should be added:
   - Under an existing "Tasks" or "TODO" section
   - After related content
   - At the end of the document

4. **Add metadata** if appropriate:
   - Priority indicators: 🔴 High, 🟡 Medium, 🟢 Low
   - Due date: 📅 YYYY-MM-DD
   - Tags: #project-name, #category
   - Context: @home, @work, @computer

## Output Format

Provide:
1. The formatted task ready to copy
2. Suggested location in the document
3. Any related tasks that might be needed

Example output:
```markdown
- [ ] 🟡 Review quarterly report 📅 ${date} #work @computer
```

**Suggested location:** Add under the "## Tasks" section, after the existing high-priority items.
