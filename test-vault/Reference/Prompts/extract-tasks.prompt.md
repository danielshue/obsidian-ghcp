---
name: Extract Tasks
description: Find and list all tasks mentioned in the current note
model: o3-mini
tools: ["read", "search"]
---
Analyze the following note and extract all tasks, action items, and to-dos:

**Note:** ${fileBasename}

**Content:**
${activeNoteContent}

Please format the output as:
1. **Explicit Tasks** - Items clearly marked as tasks (checkboxes, "TODO", etc.)
2. **Implicit Tasks** - Action items implied but not explicitly marked
3. **Deadlines** - Any mentioned due dates or timeframes

Use Obsidian task format: `- [ ] Task description`
