---
name: obsidian-tasks
description: Create and edit tasks using Obsidian Tasks plugin syntax. Use when creating tasks with due dates, start dates, scheduled dates, priorities, or recurrence in Obsidian markdown files. Triggers on requests to add tasks, set task dates, mark tasks complete, or query tasks.
---

# Obsidian Tasks

Syntax reference for the Obsidian Tasks plugin using emoji format.

## Date Emojis

All dates use `YYYY-MM-DD` format immediately after the emoji:

| Property | Emoji | Example |
|----------|-------|---------|
| Due | 📅 | `📅 2026-01-30` |
| Scheduled | ⏳ | `⏳ 2026-01-28` |
| Start | 🛫 | `🛫 2026-01-27` |
| Created | ➕ | `➕ 2026-01-25` |
| Done | ✅ | `✅ 2026-01-29` |
| Cancelled | ❌ | `❌ 2026-01-29` |

**Date meanings:**
- **Due** (📅): Deadline — must be completed by this date
- **Scheduled** (⏳): When you plan to work on it
- **Start** (🛫): Task becomes available/relevant on this date

## Priority Emojis

| Priority | Emoji |
|----------|-------|
| Highest | 🔺 |
| High | ⏫ |
| Medium | 🔼 |
| Low | 🔽 |
| Lowest | ⏬ |

## Recurrence

Use 🔁 followed by interval: `🔁 every day`, `🔁 every week`, `🔁 every month`, `🔁 every week on Monday`

## Task Examples

```markdown
- [ ] Simple task 📅 2026-01-30
- [ ] High priority task ⏫ 📅 2026-01-28
- [ ] Starts Thursday 🛫 2026-01-29 📅 2026-02-05
- [ ] Weekly standup 🔁 every week on Monday 📅 2026-02-03
- [x] Completed task ✅ 2026-01-26
```

## Task Queries

Weekly notes use code blocks with `tasks` language to query:

````markdown
```tasks
not done
due before 2026-02-01
sort by due
```
````

Common query filters:
- `not done` / `done`
- `due before/after/on YYYY-MM-DD`
- `scheduled before/after/on YYYY-MM-DD`
- `starts before/after/on YYYY-MM-DD`
- `priority is above/below medium`
- `sort by due/priority/urgency`
- `group by priority`

## Notes

- Emojis can appear in any order on the task line
- Place emojis after task description, before any tags
- When marking complete, add ✅ with completion date
