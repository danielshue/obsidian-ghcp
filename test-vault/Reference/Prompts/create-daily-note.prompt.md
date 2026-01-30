---
name: Create Daily Note
description: Generate a structured daily note with sections for tasks, goals, and reflections
argument-hint: Optionally add context like priorities or meetings
---
Create a daily note for ${date} in the vault "${workspaceFolderBasename}".

## Daily Note Structure

Please generate a daily note with the following sections:

### 📅 Today's Overview
- Date: ${date}
- Day of week and any special context

### 🎯 Today's Goals
List 3-5 priority goals for today. If I have an active note open, use it for context:
${activeNoteContent}

### 📋 Tasks
Create a task list using Obsidian checkbox format:
- [ ] Task 1
- [ ] Task 2
- [ ] Task 3

### 📅 Schedule
Include any time-blocked activities or meetings.

### 📝 Notes
Space for capturing thoughts throughout the day.

### 🌟 End of Day Reflection
- What went well?
- What could be improved?
- Key takeaways

---
Format the output as valid Obsidian Markdown with proper headings and links.
