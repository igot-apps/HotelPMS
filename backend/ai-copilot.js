#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const command = process.argv[2];
const args = process.argv.slice(3);

// --- HELPER FUNCTIONS ---

/**
 * Centralized ignore logic. 
 * ALWAYS skips node_modules, .env, and other heavy/irrelevant folders.
 */
function shouldIgnore(name, isDirectory) {
  // 1. Always ignore heavy, irrelevant, or hidden directories
  const ignoredDirs = ['node_modules', 'dist', '.git', '.vscode', 'build', '.cache', '.next'];
  if (isDirectory && ignoredDirs.includes(name)) return true;

  // 2. ALWAYS ignore environment files (Security & Context protection)
  // Matches .env, .env.local, .env.production, etc.
  if (!isDirectory && (name === '.env' || name.startsWith('.env.'))) return true;

  return false;
}

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();

    // Check ignore rules BEFORE processing
    if (shouldIgnore(f, isDirectory)) {
      return; 
    }

    if (isDirectory) {
      walkDir(dirPath, callback);
    } else {
      callback(path.join(dir, f));
    }
  });
}

// --- COMMANDS ---

// 1. CONTEXT: Grabs project structure, configs, and specific files
if (command === 'context') {
  let output = `# PROJECT CONTEXT\n\n`;
  
  // 1. File Tree
  output += `## File Structure\n\`\`\`text\n`;
  let tree = [];
  walkDir(__dirname, (filePath) => {
    tree.push(filePath.replace(__dirname, '').replace(/\\/g, '/'));
  });
  output += tree.sort().join('\n');
  output += `\n\`\`\`\n\n`;

  // 2. Core Configs
  const coreFiles = ['package.json', 'vite.config.js', 'vite.config.ts', 'tailwind.config.js', 'tsconfig.json'];
  output += `## Core Configurations\n`;
  coreFiles.forEach(file => {
    const fullPath = path.join(__dirname, file);
    if (fs.existsSync(fullPath)) {
      output += `### ${file}\n\`\`\`json\n${fs.readFileSync(fullPath, 'utf8')}\n\`\`\`\n\n`;
    }
  });

  // 3. Specific requested files
  if (args.length > 0) {
    output += `## Requested Source Files\n`;
    args.forEach(file => {
      // 🚨 SECURITY FAILSAFE: Block .env even if explicitly requested
      if (file === '.env' || file.startsWith('.env.')) {
        output += `### ${file}\n*🚫 BLOCKED: Environment files are never read to protect your secrets.*\n\n`;
        return;
      }

      const fullPath = path.join(__dirname, file);
      if (fs.existsSync(fullPath)) {
        output += `### ${file}\n\`\`\`javascript\n${fs.readFileSync(fullPath, 'utf8')}\n\`\`\`\n\n`;
      } else {
        output += `### ${file}\n*File not found*\n\n`;
      }
    });
  }

  console.log(output);
  console.log('\n---\n✅ Context generated. Copy the output above and paste it to your Browser AI.');
}

// 2. MAP: Creates a high-level React component map
if (command === 'map') {
  let output = `# REACT ARCHITECTURE MAP\n\n`;
  let components = [];
  
  walkDir(path.join(__dirname, 'src'), (filePath) => {
    if (filePath.endsWith('.jsx') || filePath.endsWith('.tsx') || filePath.endsWith('.js')) {
      const content = fs.readFileSync(filePath, 'utf8');
      const matches = content.match(/(?:export\s+(?:default\s+)?)?(?:function|const)\s+([A-Z][a-zA-Z0-9_]*)/g);
      if (matches) {
        const relPath = filePath.replace(__dirname, '').replace(/\\/g, '/');
        components.push({ path: relPath, exports: matches.map(m => m.replace(/(?:export\s+(?:default\s+)?)?(?:function|const)\s+/, '')) });
      }
    }
  });

  components.forEach(c => {
    output += `- **${c.path}**: Exports \`${c.exports.join(', ')}\`\n`;
  });

  console.log(output);
  console.log('\n✅ Map generated. Paste this to your Browser AI so it knows your component structure.');
}

// 3. ERROR: Cleans up messy Vite/Terminal errors
if (command === 'error') {
  let errorText = '';
  if (args[0] && fs.existsSync(args[0])) {
    errorText = fs.readFileSync(args[0], 'utf8');
  } else {
    console.error('Usage: node ai-copilot.js error <path-to-error-log>');
    process.exit(1);
  }

  const cleanError = errorText.replace(/\u001b\[[0-9;]*m/g, '');
  
  let output = `# VITE/REACT ERROR CONTEXT\n\n`;
  output += `## Raw Terminal Output\n\`\`\`text\n${cleanError}\n\`\`\`\n\n`;
  output += `**Instructions for AI:** Analyze the error above. Identify the exact file and line number causing the issue. Provide the fix, and format the fixed file contents inside a single JSON block like this: \`{"path/to/file.jsx": "fixed content..."}\` so I can use the \`apply\` command.`;
  
  console.log(output);
}

// 4. APPLY: Takes the AI's JSON output and writes it to your local files
if (command === 'apply') {
  const jsonFile = args[0];
  if (!jsonFile || !fs.existsSync(jsonFile)) {
    console.error('Usage: Save the AI\'s JSON response to a file (e.g., patch.json), then run: node ai-copilot.js apply patch.json');
    process.exit(1);
  }

  try {
    const patches = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
    let applied = 0;

    for (const [filePath, content] of Object.entries(patches)) {
      // 🚨 SECURITY FAILSAFE: Prevent the AI from accidentally overwriting .env files
      if (filePath === '.env' || filePath.startsWith('.env.')) {
        console.log(`🚫 BLOCKED: Refusing to write to ${filePath} to protect your secrets.`);
        continue;
      }

      const fullPath = path.join(__dirname, filePath);
      const dir = path.dirname(fullPath);
      
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`✅ Applied changes to: ${filePath}`);
      applied++;
    }
    console.log(`\n🎉 Successfully applied ${applied} file(s). Restart your Vite dev server if necessary.`);
  } catch (e) {
    console.error('❌ Failed to parse JSON patch file. Ensure the AI gave you valid JSON.');
  }
}