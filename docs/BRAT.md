# Installing with BRAT (Beta Reviewers Auto-update Tester)

BRAT is an Obsidian community plugin that allows you to install and test plugins directly from GitHub repositories before they're published to the official community plugin directory.

## Prerequisites

1. Obsidian installed on your system
2. Community plugins enabled in Obsidian settings

## Step 1: Install BRAT

1. Open Obsidian
2. Go to **Settings → Community plugins**
3. Click **Browse** to open the community plugin browser
4. Search for "BRAT"
5. Click **Install** on "Obsidian42 - BRAT"
6. After installation, click **Enable**

## Step 2: Add Vault Copilot via BRAT

1. Go to **Settings → Community plugins → Obsidian42 - BRAT**
2. Click **Add Beta plugin**
3. Enter the repository URL:
   ```
   danielshue/obsidian-vault-copilot
   ```
4. Click **Add Plugin**
5. BRAT will download and install the latest release from GitHub

## Step 3: Enable Vault Copilot

1. Go to **Settings → Community plugins**
2. Find "Vault Copilot" in your installed plugins list
3. Toggle the switch to **enable** the plugin

## Updating the Plugin

BRAT can automatically check for updates from the GitHub repository:

### Manual Update
1. Go to **Settings → Community plugins → Obsidian42 - BRAT**
2. Click **Check for updates**
3. If an update is available, click **Update**

### Automatic Updates
1. In BRAT settings, enable **Auto-update plugins at startup**
2. BRAT will check for new releases each time Obsidian starts

## Installing a Specific Branch or Version

To test a specific branch (e.g., a feature branch):

1. Go to **Settings → Community plugins → Obsidian42 - BRAT**
2. Click **Add Beta plugin with frozen version**
3. Enter the repository: `danielshue/obsidian-vault-copilot`
4. Specify the branch name or tag

## Troubleshooting

### Plugin Not Loading
- Ensure the repository has a valid release with `main.js`, `manifest.json`, and `styles.css`
- Check the Obsidian developer console (Ctrl+Shift+I / Cmd+Option+I) for errors
- Try removing and re-adding the plugin through BRAT

### Update Not Showing
- BRAT checks the GitHub releases page for new versions
- Ensure a new release has been published (not just commits to main)
- Click **Check for updates** manually in BRAT settings

### Removing the Plugin
1. Go to **Settings → Community plugins → Obsidian42 - BRAT**
2. Find "obsidian-vault-copilot" in the beta plugins list
3. Click the **X** to remove it
4. Alternatively, disable through **Settings → Community plugins**

## Links

- [BRAT Plugin](https://github.com/TfTHacker/obsidian42-brat)
- [Vault Copilot Repository](https://github.com/danielshue/obsidian-vault-copilot)
- [BRAT Documentation](https://tfthacker.com/brat)
