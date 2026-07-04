#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

// In ES Modules, __dirname doesn't exist by default, so we recreate it
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// --- HELPER FUNCTIONS ---

function shouldIgnoreForTree(name, isDirectory) {
  const ignoredDirs = ['node_modules', 'dist', '.git', '.vscode', 'build', '.cache', '.next'];
  if (isDirectory && ignoredDirs.includes(name)) return true;
  return false;
}

function isSecretFile(name) {
  return name === '.env' || name.startsWith('.env.');
}

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();

    if (shouldIgnoreForTree(f, isDirectory)) return; 

    if (isDirectory) {
      walkDir(dirPath, callback);
    } else {
      callback(path.join(dir, f));
    }
  });
}

function returnToMenu() {
  console.log('\n---');
  rl.question('Press Enter to return to the main menu...', () => {
    showMenu();
  });
}

// --- CORE LOGIC ---

function generateContext(specificFiles = []) {
  let output = `# PROJECT CONTEXT\n\n`;
  
  output += `## File Structure\n\`\`\`text\n`;
  let tree = [];
  walkDir(__dirname, (filePath) => {
    tree.push(filePath.replace(__dirname, '').replace(/\\/g, '/'));
  });
  output += tree.sort().join('\n');
  output += `\n\`\`\`\n\n`;

  const coreFiles = ['package.json', 'vite.config.js', 'vite.config.ts', 'tailwind.config.js', 'tsconfig.json'];
  output += `## Core Configurations\n`;
  coreFiles.forEach(file => {
    const fullPath = path.join(__dirname, file);
    if (fs.existsSync(fullPath)) {
      output += `### ${file}\n\`\`\`json\n${fs.readFileSync(fullPath, 'utf8')}\n\`\`\`\n\n`;
    }
  });

  if (specificFiles.length > 0) {
    output += `## Requested Source Files\n`;
    specificFiles.forEach(file => {
      if (isSecretFile(file)) {
        output += `### ${file}\n*🔒 File exists, but contents are hidden to protect secrets.*\n\n`;
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

  console.log('\n✅ CONTEXT GENERATED. Copy the output above to your Browser AI.\n');
  console.log(output);
  returnToMenu();
}

function generateMap() {
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

  console.log('\n✅ MAP GENERATED. Copy the output above to your Browser AI.\n');
  console.log(output);
  returnToMenu();
}

function cleanError(errorFilePath) {
  if (!fs.existsSync(errorFilePath)) {
    console.log(`❌ Error: File not found at ${errorFilePath}`);
    return returnToMenu();
  }

  const errorText = fs.readFileSync(errorFilePath, 'utf8');
  const cleanError = errorText.replace(/\u001b\[[0-9;]*m/g, '');
  
  let output = `# VITE/REACT ERROR CONTEXT\n\n`;
  output += `## Raw Terminal Output\n\`\`\`text\n${cleanError}\n\`\`\`\n\n`;
  output += `**Instructions for AI:** Analyze the error above. Identify the exact file and line number causing the issue. Provide the fix, and format the fixed file contents inside a single JSON block like this: \`{"path/to/file.jsx": "fixed content..."}\` so I can use the Apply tool.`;
  
  console.log('\n✅ ERROR CLEANED. Copy the output above to your Browser AI.\n');
  console.log(output);
  returnToMenu();
}

function applyPatch(jsonFilePath) {
  if (!fs.existsSync(jsonFilePath)) {
    console.log(`❌ Error: JSON patch file not found at ${jsonFilePath}`);
    return returnToMenu();
  }

  try {
    const patches = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
    let applied = 0;

    for (const [filePath, content] of Object.entries(patches)) {
      if (isSecretFile(filePath)) {
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
    console.log(`\n🎉 Successfully applied ${applied} file(s).`);
  } catch (e) {
    console.error('❌ Failed to parse JSON. Ensure the AI gave you valid JSON.');
  }
  returnToMenu();
}

// --- INTERACTIVE MENU ---

function showMenu() {
  console.log('\n=========================================');
  console.log('       🤖 AI COPILOT TOOLKIT 🤖');
  console.log('=========================================');
  console.log('1. Generate Context (Core files + tree)');
  console.log('2. Generate Context (Specific files)');
  console.log('3. Generate React Architecture Map');
  console.log('4. Clean & Format Terminal Error');
  console.log('5. Apply AI JSON Patch');
  console.log('6. Exit');
  console.log('=========================================\n');

  rl.question('Select an option (1-6): ', (answer) => {
    const choice = answer.trim();

    if (choice === '1') {
      generateContext();
    } 
    else if (choice === '2') {
      rl.question('Enter file paths (comma-separated, e.g., src/App.jsx,src/utils.js): ', (files) => {
        const fileList = files.split(',').map(f => f.trim()).filter(f => f);
        generateContext(fileList);
      });
    } 
    else if (choice === '3') {
      generateMap();
    } 
    else if (choice === '4') {
      rl.question('Enter path to your error log file (e.g., error.log): ', (errPath) => {
        cleanError(errPath.trim());
      });
    } 
    else if (choice === '5') {
      rl.question('Enter path to your JSON patch file (e.g., patch.json): ', (jsonPath) => {
        applyPatch(jsonPath.trim());
      });
    } 
    else if (choice === '6') {
      console.log('Goodbye! 👋');
      rl.close();
      process.exit(0);
    } 
    else {
      console.log('❌ Invalid choice. Please try again.');
      showMenu();
    }
  });
}

// Start the app
showMenu();