---
name: Summarize Note
description: Create a concise summary of the active note
model: GPT-5.2
argument-hint: Select a note to summarize
---
Please summarize the following note in a clear, concise format:

**Title:** ${file}

**Content:**
${activeNoteContent}

Provide:
1. A one-paragraph summary
2. Key points (bullet list)
3. Action items (if any)
