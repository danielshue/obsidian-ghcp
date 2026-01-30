# Vault Document Creation Instructions

When creating or modifying documents in this Obsidian vault, always follow these guidelines:

## Frontmatter Requirements

Every document MUST include YAML frontmatter with at minimum:
- `creation-date`: The date the document was created (format: YYYY-MM-DD)
- `modified-date`: The date the document was last modified (format: YYYY-MM-DD)

### Required Frontmatter Template

```yaml
---
creation-date: YYYY-MM-DD
modified-date: YYYY-MM-DD
tags: []
---
```

### Extended Frontmatter (Recommended)

For richer metadata, include these additional fields when appropriate:

```yaml
---
creation-date: YYYY-MM-DD
modified-date: YYYY-MM-DD
tags: []
aliases: []
status: draft | in-progress | complete | archived
type: note | project | reference | daily | meeting
---
```

## Document Creation Rules

When creating new documents:
1. Always start with valid YAML frontmatter
2. Set `creation-date` to today's date
3. Set `modified-date` to today's date
4. Include relevant tags as an array
5. Use descriptive filenames with spaces (Obsidian handles them well)

When modifying existing documents:
1. Update `modified-date` to today's date
2. Preserve the original `creation-date`
3. Add new tags without removing existing ones unless requested

## Formatting Standards

- Use Markdown headings (##, ###) for document structure
- Use `[[wikilinks]]` for internal links to other vault notes
- Use bullet lists for unordered items
- Use numbered lists for sequential steps or ordered items
- Include a brief summary or purpose at the top of each document after the frontmatter

## Example Document

```markdown
---
creation-date: 2026-01-29
modified-date: 2026-01-29
tags: [example, template]
status: complete
type: reference
---

# Example Document Title

Brief description of what this document covers.

## Section One

Content goes here with [[links to other notes]] as needed.

## Section Two

- Bullet point one
- Bullet point two
```
