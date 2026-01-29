import { copyFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PLUGIN_ID = "obsidian-vault-copilot";
const TEST_VAULT_PATH = join(__dirname, "test-vault");
const PLUGIN_DEST = join(TEST_VAULT_PATH, ".obsidian", "plugins", PLUGIN_ID);

const FILES_TO_COPY = ["main.js", "manifest.json", "styles.css"];

// Ensure destination directory exists
if (!existsSync(PLUGIN_DEST)) {
	mkdirSync(PLUGIN_DEST, { recursive: true });
}

console.log(`Deploying plugin to: ${PLUGIN_DEST}`);

let copied = 0;
for (const file of FILES_TO_COPY) {
	const src = join(__dirname, file);
	const dest = join(PLUGIN_DEST, file);

	if (existsSync(src)) {
		copyFileSync(src, dest);
		console.log(`  ✓ ${file}`);
		copied++;
	} else {
		console.log(`  ✗ ${file} (not found - run build first)`);
	}
}

console.log(`\nDeployed ${copied}/${FILES_TO_COPY.length} files.`);

if (copied === FILES_TO_COPY.length) {
	console.log(`\nTest vault ready at: ${TEST_VAULT_PATH}`);
	console.log("Open this folder as a vault in Obsidian to test the plugin.");
} else {
	console.log("\nWarning: Some files were missing. Run 'npm run build' first.");
	process.exit(1);
}
