---
name: Daily Review
description: Generate a daily review based on today's notes
argument-hint: Run at end of day for best results
---
Today is ${date}.

Please help me create a daily review by analyzing any notes I may have worked on today. Consider:

1. **What I accomplished** - Key tasks and progress
2. **What I learned** - New insights or knowledge gained  
3. **What needs follow-up** - Items requiring future attention
4. **Tomorrow's priorities** - Suggested focus areas

If I have an active note open, please incorporate it into the review:

**Active Note:** ${file}
${activeNoteContent}
