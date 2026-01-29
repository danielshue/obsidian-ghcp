# Getting Started with the Test Vault

This reference guide explains how to use this test vault for plugin development.

## Structure

```
test-vault/
├── .obsidian/
│   └── plugins/
│       └── obsidian-vault-copilot/
├── Daily Notes/
├── Projects/
├── Reference/
└── Welcome.md
```

## Testing the Plugin

1. Build the plugin: `npm run build`
2. Deploy to test vault: `npm run deploy`
3. Open the vault in Obsidian
4. Enable the plugin in Settings → Community plugins

## Sample Queries

Try these prompts in the Copilot chat:

- "What projects am I working on?"
- "Summarize my notes from yesterday"
- "Create a new daily note for today"
- "Search for notes about AI"

#reference #setup #testing
