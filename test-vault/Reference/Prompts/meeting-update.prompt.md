---
name: Meeting Update
description: Create a structured meeting notes update from the current note
model: GPT-5.2
argument-hint: Open a meeting note or provide meeting context
tools: ["read", "search"]
---
Generate a meeting update summary based on the following context.

## Current Note
**File:** ${file}

**Content:**
${activeNoteContent}

---

## Instructions

Please create a professional meeting update with the following structure:

### 📋 Meeting Summary
- **Meeting Title:** [Extract or infer from content]
- **Date:** ${date}
- **Participants:** [List attendees if mentioned]

### 🎯 Key Discussion Points
Summarize the main topics discussed in bullet points.

### ✅ Decisions Made
List any decisions that were reached during the meeting.

### 📌 Action Items
Format as tasks with assignees and due dates if available:
- [ ] **[Owner]:** Task description - Due: [Date]
- [ ] **[Owner]:** Task description - Due: [Date]

### 🔗 Follow-up Items
Items that need further discussion or follow-up in future meetings.

### 📝 Additional Notes
Any other relevant information or context.

---

Format the output as clean Obsidian Markdown. Use [[wikilinks]] for referencing other notes where appropriate.
