---
name: Create Release
description: Automate version bump, tagging, and GitHub release for obsidian-vault-copilot
tools: ["mcp_github_get_latest_release", "mcp_github_list_tags", "mcp_github_push_files", "mcp_github_create_branch", "mcp_github_list_releases"]
argument-hint: Specify major, minor, or patch version bump
---
# Create Release for obsidian-vault-copilot

You are helping automate the release process for the **obsidian-vault-copilot** Obsidian plugin.

## Repository Information
- **Owner:** danielshue
- **Repo:** obsidian-vault-copilot
- **Current versions.json:** 
```json
${activeNoteContent}
```

## Release Process

Please perform the following steps:

### Step 1: Get Current Version
Use #tool:mcp_github_get_latest_release to fetch the latest release from `danielshue/obsidian-vault-copilot`.

If no releases exist yet, assume version `0.0.0` as the starting point.

### Step 2: Calculate New Version
Based on user input (major/minor/patch), calculate the next version:
- **patch** (default): 0.0.1 → 0.0.2
- **minor**: 0.0.1 → 0.1.0  
- **major**: 0.0.1 → 1.0.0

### Step 3: Update Version Files
Prepare updated content for these files:

1. **manifest.json** - Update the `"version"` field to the new version
2. **versions.json** - Add the new version mapping: `"NEW_VERSION": "0.15.0"`
3. **package.json** - Update the `"version"` field to the new version

### Step 4: Push Changes
Use #tool:mcp_github_push_files to commit and push the version updates to the repository with message:
```
Bump version to X.Y.Z
```

### Step 5: Create Release
Use the GitHub MCP tools to:
1. Create a new tag for the version (e.g., `0.0.2`)
2. Create a GitHub release with:
   - Tag name: The new version (no 'v' prefix per Obsidian conventions)
   - Release title: `Release X.Y.Z`
   - Release notes: Auto-generate from commits since last release

## Output Format

After completing the release, provide:
1. ✅ Previous version
2. ✅ New version  
3. ✅ Files updated
4. ✅ Commit SHA
5. ✅ Release URL

## Important Notes
- Obsidian plugins use version numbers WITHOUT a 'v' prefix (e.g., `1.0.0` not `v1.0.0`)
- The `versions.json` maps plugin versions to minimum Obsidian app versions
- Always verify the current version before bumping to avoid conflicts
