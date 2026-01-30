# Vault Copilot Developer API

This guide explains how third-party Obsidian plugins can integrate with Vault Copilot to register skills, configure MCP servers, and extend the AI assistant's capabilities.

## Overview

Vault Copilot provides an extensible API that allows other plugins to:

- **Register Skills**: Define custom tools/functions the AI can invoke
- **Configure MCP Servers**: Add Model Context Protocol servers for additional capabilities
- **Listen to Events**: React to skill registration/unregistration changes
- **Manage Sessions**: Create, load, archive, and delete chat sessions
- **Operate on Notes**: Read, create, update, search, and delete notes programmatically
- **Send Messages**: Interact with the AI assistant directly from your plugin

## Getting Started

### Accessing the API

To access the Vault Copilot API, use Obsidian's plugin API:

```typescript
import { Plugin } from "obsidian";

export default class MyPlugin extends Plugin {
  async onload() {
    // Wait for Vault Copilot to be ready
    const vaultCopilot = (this.app as any).plugins?.plugins?.["obsidian-vault-copilot"];
    
    if (vaultCopilot) {
      const api = vaultCopilot.api;
      // Use the API...
    }
  }
}
```

### Recommended Pattern: Wait for Plugin

Since Vault Copilot may load after your plugin, use a pattern that waits for it:

```typescript
import { Plugin } from "obsidian";

export default class MyPlugin extends Plugin {
  private vaultCopilotApi: VaultCopilotAPI | null = null;

  async onload() {
    // Try to get API immediately
    this.vaultCopilotApi = this.getVaultCopilotAPI();
    
    if (!this.vaultCopilotApi) {
      // Wait for Vault Copilot to load
      this.app.workspace.onLayoutReady(() => {
        this.vaultCopilotApi = this.getVaultCopilotAPI();
        if (this.vaultCopilotApi) {
          this.registerMySkills();
        }
      });
    } else {
      this.registerMySkills();
    }
  }

  private getVaultCopilotAPI(): VaultCopilotAPI | null {
    const vaultCopilot = (this.app as any).plugins?.plugins?.["obsidian-vault-copilot"];
    return vaultCopilot?.api ?? null;
  }

  private registerMySkills() {
    // Register your skills here
  }

  async onunload() {
    // Clean up skills when plugin unloads
    if (this.vaultCopilotApi) {
      this.vaultCopilotApi.unregisterPluginSkills("your-plugin-id");
    }
  }
}
```

## Skill Registration

### What is a Skill?

A skill is a function that the AI assistant can invoke. Skills have:

- A unique name
- A description (shown to the AI)
- Parameter definitions with a schema
- A handler function that performs the action

### Registering a Skill

```typescript
api.registerSkill({
  name: "create_daily_note",
  description: "Creates a new daily note with the specified content",
  pluginId: "my-daily-notes-plugin",
  category: "notes",
  parameters: {
    type: "object",
    properties: {
      date: {
        type: "string",
        description: "The date for the note in YYYY-MM-DD format"
      },
      content: {
        type: "string",
        description: "Initial content for the note"
      }
    },
    required: ["date"]
  },
  handler: async (args) => {
    const { date, content } = args as { date: string; content?: string };
    
    // Your logic here
    const filePath = `Daily Notes/${date}.md`;
    await this.app.vault.create(filePath, content || "# " + date);
    
    return {
      success: true,
      data: { filePath }
    };
  }
});
```

### Skill Interface

```typescript
interface VaultCopilotSkill {
  /** Unique skill identifier (use kebab-case) */
  name: string;
  
  /** Human-readable description for the AI */
  description: string;
  
  /** Parameter schema (see SkillParameterSchema below) */
  parameters: SkillParameterSchema;
  
  /** Handler function that executes the skill */
  handler: (args: Record<string, unknown>) => Promise<SkillResult>;
  
  /** Optional: Your plugin's ID (recommended for cleanup) */
  pluginId?: string;
  
  /** Optional: Plugin name for display purposes */
  pluginName?: string;
  
  /** Optional: Version of the skill */
  version?: string;
  
  /** Optional: Whether this skill requires confirmation before execution */
  requiresConfirmation?: boolean;
  
  /** Optional: Category for grouping skills */
  category?: 'notes' | 'search' | 'automation' | 'integration' | 'utility' | 'custom';
}

interface SkillResult {
  success: boolean;
  data?: unknown;
  error?: string;
}
```

### Parameter Schema Guidelines

Use the `SkillParameterSchema` interface to define your parameters:

```typescript
interface SkillParameterSchema {
  type: 'object';
  properties: Record<string, {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    description: string;
    enum?: string[];
    items?: { type: string };
    default?: unknown;
  }>;
  required?: string[];
}
```

Example usage:

```typescript
parameters: {
  type: "object",
  properties: {
    // String parameter
    query: {
      type: "string",
      description: "Search query to find notes"
    },
    // Number parameter
    limit: {
      type: "number",
      description: "Maximum results to return",
      default: 10
    },
    // Boolean parameter
    includeArchived: {
      type: "boolean",
      description: "Include archived notes",
      default: false
    },
    // Enum parameter
    sortBy: {
      type: "string",
      enum: ["name", "modified", "created"],
      description: "Sort order for results"
    },
    // Array parameter
    tags: {
      type: "array",
      items: { type: "string" },
      description: "Filter by tags"
    }
  },
  required: ["query"]
}
```

### Updating a Skill

To update an existing skill (e.g., change description or parameters):

```typescript
api.updateSkill({
  name: "create_daily_note",
  description: "Creates or updates a daily note with content",
  parameters: { /* ... */ },
  handler: async (args) => { /* ... */ }
});
```

### Unregistering Skills

```typescript
// Unregister a single skill by name
api.unregisterSkill("create_daily_note");

// Unregister all skills from your plugin (recommended in onunload)
// Returns the number of skills unregistered
const count = api.unregisterPluginSkills("my-daily-notes-plugin");
```

## Querying Skills

### List All Skills

```typescript
const skills = api.listSkills();
// Returns: SkillInfo[]
```

### List by Category

```typescript
const noteSkills = api.listSkillsByCategory("notes");
```

### List by Plugin

```typescript
const mySkills = api.listSkillsByPlugin("my-plugin-id");
```

### Check if Skill Exists

```typescript
if (api.hasSkill("create_daily_note")) {
  // Skill is available
}
```

## Executing Skills

While skills are typically invoked by the AI, you can also execute them programmatically:

```typescript
const result = await api.executeSkill("create_daily_note", {
  date: "2024-01-15",
  content: "# Meeting Notes\n\n- Item 1\n- Item 2"
});

if (result.success) {
  console.log("Created note:", result.data);
} else {
  console.error("Failed:", result.error);
}
```

## Event Handling

Subscribe to skill registry changes:

```typescript
const unsubscribe = api.onSkillChange((event) => {
  switch (event.type) {
    case "registered":
      console.log(`New skill: ${event.skillName}`);
      break;
    case "unregistered":
      console.log(`Removed skill: ${event.skillName}`);
      break;
    case "updated":
      console.log(`Updated skill: ${event.skillName}`);
      break;
  }
});

// Later, to stop listening:
unsubscribe();
```

## MCP Server Configuration

### What is MCP?

Model Context Protocol (MCP) is a standard for connecting AI assistants to external tools and data sources. You can configure MCP servers to extend Vault Copilot's capabilities.

### Adding an MCP Server

```typescript
api.configureMcpServer("my-mcp-server", {
  name: "My Custom Server",
  url: "http://localhost:3000",
  apiKey: "optional-api-key",
  enabled: true
});
```

### Removing an MCP Server

```typescript
api.removeMcpServer("my-mcp-server");
```

### Listing MCP Servers

```typescript
const servers = api.getMcpServers();
// Returns: Map<string, McpServerConfig>

for (const [id, server] of servers) {
  console.log(`${id}: ${server.url} (${server.enabled ? "enabled" : "disabled"})`);
}
```

## Best Practices

### Skill Naming

- Use kebab-case: `create-daily-note`, `search-vault`
- Be descriptive but concise
- Prefix with your plugin name if generic: `myplugin-search`

### Descriptions

Write descriptions that help the AI understand when to use the skill:

```typescript
// Good
description: "Searches the vault for notes matching a query. Returns note titles and paths. Use this when the user wants to find specific notes."

// Too brief
description: "Search notes"
```

### Error Handling

Always return structured results from your handler:

```typescript
handler: async (args) => {
  try {
    // Your logic
    return { success: true, data: result };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}
```

### Cleanup

Always unregister your skills when your plugin unloads:

```typescript
async onunload() {
  const api = this.getVaultCopilotAPI();
  if (api) {
    api.unregisterPluginSkills(this.manifest.id);
  }
}
```

### Categories

Use consistent categories to help organize skills:

| Category | Use for |
|----------|---------|
| `notes` | Creating, reading, updating notes |
| `search` | Searching and querying vault content |
| `automation` | Automated workflows and batch operations |
| `integration` | External service integrations |
| `utility` | General-purpose tools |
| `custom` | Default for uncategorized skills |

## Customization Directories

Vault Copilot supports three types of customization directories that users can configure in plugin settings:

### Agent Directories

Agents are custom personas with specific instructions and tool configurations. Agent files use the `.agent.md` extension and contain frontmatter with metadata.

**File pattern:** `*.agent.md`

**Example structure:**
```markdown
---
name: Research Assistant
description: Helps with academic research and citation
tools:
  - search_notes
  - create_note
  - batch_read_notes
---

You are a research assistant specialized in academic work...
```

### Skill Directories

Skills define reusable capabilities and tool definitions. Each skill is organized as a subfolder containing a `SKILL.md` file.

**Structure:** `<skill-name>/SKILL.md`

**Example:**
```
skills/
  note-formatter/
    SKILL.md
  citation-helper/
    SKILL.md
```

The `SKILL.md` file contains instructions and can include code blocks for structured configuration.

### Instruction Directories

Instructions provide additional context and guidelines that the assistant follows. Instruction files use the `.instructions.md` extension.

**File pattern:** `*.instructions.md`

**Example:**
```markdown
---
name: Vault Organization
applyTo: "**"
---

When creating notes in this vault:
- Use sentence case for titles
- Add a "created" date in frontmatter
- Place new notes in appropriate folders based on content type
```

### Configuring Directories

Users configure these directories in **Settings → Vault Copilot → Advanced Settings**:

- **Skill Directories**: Folders containing skill subfolders with `SKILL.md` files
- **Agent Directories**: Folders containing `*.agent.md` files
- **Instruction Directories**: Folders containing `*.instructions.md` files

Paths can be relative to the vault (e.g., `.copilot/agents`) or absolute paths.

## TypeScript Types

For TypeScript users, here are the complete type definitions:

```typescript
interface VaultCopilotAPI {
  // Connection
  isConnected(): boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  
  // Chat
  sendMessage(prompt: string): Promise<string>;
  sendMessageStreaming(prompt: string, onDelta: (delta: string) => void, onComplete?: (fullContent: string) => void): Promise<void>;
  getMessageHistory(): ChatMessage[];
  clearHistory(): Promise<void>;
  
  // Session Management
  listSessions(): SessionInfo[];
  getActiveSessionId(): string | null;
  createSession(name?: string): Promise<SessionInfo>;
  loadSession(sessionId: string): Promise<void>;
  archiveSession(sessionId: string): Promise<void>;
  unarchiveSession(sessionId: string): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  renameSession(sessionId: string, newName: string): Promise<void>;
  
  // Skill Management
  registerSkill(skill: VaultCopilotSkill): void;
  updateSkill(skill: VaultCopilotSkill): void;
  unregisterSkill(name: string): boolean;
  unregisterPluginSkills(pluginId: string): number;
  
  // Skill Queries
  listSkills(): SkillInfo[];
  listSkillsByCategory(category: string): SkillInfo[];
  listSkillsByPlugin(pluginId: string): SkillInfo[];
  hasSkill(name: string): boolean;
  
  // Skill Execution
  executeSkill(name: string, args: Record<string, unknown>): Promise<SkillResult>;
  
  // Event Handling
  onSkillChange(callback: (event: SkillRegistryEvent) => void): () => void;
  
  // MCP Configuration
  configureMcpServer(id: string, config: McpServerConfig): void;
  removeMcpServer(id: string): boolean;
  getMcpServers(): Map<string, McpServerConfig>;
  
  // Note Operations
  readNote(path: string): Promise<{ success: boolean; content?: string; error?: string }>;
  searchNotes(query: string, limit?: number): Promise<{ results: Array<{ path: string; title: string; excerpt: string }> }>;
  createNote(path: string, content: string): Promise<{ success: boolean; path?: string; error?: string }>;
  getActiveNote(): Promise<{ hasActiveNote: boolean; path?: string; title?: string; content?: string }>;
  listNotes(folder?: string): Promise<{ notes: Array<{ path: string; title: string }> }>;
  appendToNote(path: string, content: string): Promise<{ success: boolean; error?: string }>;
  batchReadNotes(paths: string[]): Promise<{ results: Array<{ path: string; success: boolean; content?: string; error?: string }> }>;
  updateNote(path: string, content: string): Promise<{ success: boolean; error?: string }>;
  deleteNote(path: string): Promise<{ success: boolean; error?: string }>;
  getRecentChanges(limit?: number): Promise<{ files: Array<{ path: string; title: string; mtime: number; mtimeFormatted: string }> }>;
  getDailyNote(date?: string): Promise<{ success: boolean; path?: string; content?: string; exists: boolean; error?: string }>;
  renameNote(oldPath: string, newPath: string): Promise<{ success: boolean; newPath?: string; error?: string }>;
}

interface SkillParameterSchema {
  type: 'object';
  properties: Record<string, {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    description: string;
    enum?: string[];
    items?: { type: string };
    default?: unknown;
  }>;
  required?: string[];
}

interface VaultCopilotSkill {
  name: string;
  description: string;
  parameters: SkillParameterSchema;
  handler: (args: Record<string, unknown>) => Promise<SkillResult>;
  pluginId?: string;
  pluginName?: string;
  version?: string;
  requiresConfirmation?: boolean;
  category?: 'notes' | 'search' | 'automation' | 'integration' | 'utility' | 'custom';
}

interface SkillInfo {
  name: string;
  description: string;
  parameters: SkillParameterSchema;
  pluginId?: string;
  pluginName?: string;
  version?: string;
  requiresConfirmation?: boolean;
  category?: string;
  registeredAt: number;
}

interface SkillResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

interface SkillRegistryEvent {
  type: 'registered' | 'unregistered' | 'updated';
  skillName: string;
  skill?: SkillInfo;
}

interface McpServerConfig {
  url: string;
  apiKey?: string;
  name?: string;
  enabled?: boolean;
}

interface SessionInfo {
  id: string;
  name: string;
  createdAt: number;
  lastUsedAt: number;
  completedAt?: number;
  durationMs?: number;
  archived: boolean;
  messageCount: number;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}
```

## Example Plugin

Here's a complete example plugin that registers a skill:

```typescript
import { Plugin, Notice } from "obsidian";

interface VaultCopilotAPI {
  registerSkill(skill: any): void;
  unregisterPluginSkills(pluginId: string): number;
}

export default class QuickNotePlugin extends Plugin {
  private api: VaultCopilotAPI | null = null;

  async onload() {
    this.app.workspace.onLayoutReady(() => {
      this.api = this.getVaultCopilotAPI();
      if (this.api) {
        this.registerSkills();
        new Notice("Quick Note skills registered with Vault Copilot");
      }
    });
  }

  private getVaultCopilotAPI(): VaultCopilotAPI | null {
    const vc = (this.app as any).plugins?.plugins?.["obsidian-vault-copilot"];
    return vc?.api ?? null;
  }

  private registerSkills() {
    if (!this.api) return;

    this.api.registerSkill({
      name: "quick-note-create",
      description: "Creates a quick note with a timestamp in the specified folder",
      pluginId: this.manifest.id,
      category: "notes",
      parameters: {
        type: "object",
        properties: {
          folder: {
            type: "string",
            description: "Folder path for the note",
            default: "Quick Notes"
          },
          title: {
            type: "string",
            description: "Title for the note"
          },
          content: {
            type: "string",
            description: "Note content"
          }
        },
        required: ["content"]
      },
      handler: async (args: Record<string, unknown>) => {
        const folder = (args.folder as string) || "Quick Notes";
        const title = (args.title as string) || new Date().toISOString();
        const content = args.content as string;

        try {
          const path = `${folder}/${title}.md`;
          await this.app.vault.create(path, content);
          return { success: true, data: { path } };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : "Failed to create note"
          };
        }
      }
    });
  }

  async onunload() {
    if (this.api) {
      this.api.unregisterPluginSkills(this.manifest.id);
    }
  }
}
```

## Troubleshooting

### Skill Not Appearing

1. Verify Vault Copilot is installed and enabled
2. Check the skill was registered (use `api.hasSkill("name")`)
3. Ensure the skill name is unique

### Skill Execution Fails

1. Check the console for errors
2. Verify parameter types match the schema
3. Ensure the execute function handles all edge cases

### API Not Available

1. Wait for `workspace.onLayoutReady()`
2. Check plugin load order in settings
3. Verify Vault Copilot plugin ID is correct: `obsidian-vault-copilot`

## Support

- **Issues**: [GitHub Issues](https://github.com/danielshue/obsidian-vault-copilot/issues)
- **Discussions**: [GitHub Discussions](https://github.com/danielshue/obsidian-vault-copilot/discussions)
