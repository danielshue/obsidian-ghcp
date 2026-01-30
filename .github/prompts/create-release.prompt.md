---
name: Create Release
description: Automate version bump, tagging, and GitHub release for obsidian-vault-copilot
tools: ["mcp_github_list_releases", "mcp_github_get_file_contents", "mcp_github_push_files", "run_in_terminal"]
argument-hint: Specify major, minor, or patch version bump (default: patch)
---
# Create Release for obsidian-vault-copilot

You are helping automate the release process for the **obsidian-vault-copilot** Obsidian plugin.

## Repository Information
- **Owner:** danielshue
- **Repo:** obsidian-vault-copilot

## Release Process

Please perform the following steps:

### Step 1: Get Current Version
Use `mcp_github_list_releases` to fetch the latest release from `danielshue/obsidian-vault-copilot`.

If no releases exist yet, assume version `0.0.0` as the starting point.

### Step 2: Calculate New Version
Based on user input (major/minor/patch), calculate the next version:
- **patch** (default): 0.0.1 → 0.0.2
- **minor**: 0.0.1 → 0.1.0  
- **major**: 0.0.1 → 1.0.0

### Step 3: Get Current File Contents
Use `mcp_github_get_file_contents` to fetch the current contents of:
- `manifest.json`
- `versions.json`
- `package.json`

### Step 4: Update Version Files
Use `mcp_github_push_files` to commit and push all version updates in a single commit:

1. **manifest.json** - Update the `"version"` field to the new version
2. **versions.json** - Add the new version mapping: `"NEW_VERSION": "0.15.0"` (preserving existing entries)
3. **package.json** - Update the `"version"` field to the new version

Commit message: `Bump version to X.Y.Z`

### Step 5: Create Release
Use `run_in_terminal` to create the GitHub release with the `gh` CLI:

```bash
gh release create X.Y.Z --repo danielshue/obsidian-vault-copilot --title "Release X.Y.Z" --generate-notes
```

This command will:
- Create a new tag `X.Y.Z` (no 'v' prefix per Obsidian conventions)
- Create a GitHub release with auto-generated release notes from commits since the last release
- The release workflow in `.github/workflows/release.yml` will automatically attach build artifacts

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
- Ensure GitHub CLI (`gh`) is installed and authenticated
