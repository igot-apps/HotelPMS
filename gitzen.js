#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ==========================================
// 🎨 UI & TERMINAL HELPERS (Zero Dependencies)
// ==========================================
const c = {
    reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
    red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
    blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', gray: '\x1b[90m'
};
const log = (msg, color = c.reset) => console.log(`${color}${msg}${c.reset}`);
const success = (msg) => log(`✅ ${msg}`, c.green);
const error = (msg) => log(`❌ ${msg}`, c.red);
const info = (msg) => log(`ℹ️  ${msg}`, c.cyan);
const warn = (msg) => log(`⚠️  ${msg}`, c.yellow);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(`${c.cyan}${q}${c.reset} `, resolve));

async function selectMenu(title, choices) {
    console.log(`\n${c.bold}${c.blue}${title}${c.reset}`);
    choices.forEach((choice, i) => console.log(`  ${c.yellow}${i + 1}${c.reset}) ${choice}`));
    console.log(`  ${c.gray}0) Cancel${c.reset}\n`);
    while (true) {
        const ans = await ask('Select an option: ');
        const num = parseInt(ans);
        if (num === 0) return null;
        if (num > 0 && num <= choices.length) return num - 1;
        warn('Invalid choice, try again.');
    }
}

// ==========================================
// ⚙️ GIT & FILE HELPERS
// ==========================================
function runGit(args, silent = false) {
    try {
        const result = execSync(`git ${args}`, { encoding: 'utf8', stdio: silent ? 'pipe' : 'inherit' });
        return { success: true, output: result ? result.trim() : '' };
    } catch (e) {
        let out = '';
        if (e.stdout) out += typeof e.stdout === 'string' ? e.stdout : e.stdout.toString();
        if (e.stderr) out += typeof e.stderr === 'string' ? e.stderr : e.stderr.toString();
        if (!out) out = e.message;
        return { success: false, output: out.trim() };
    }
}

function isGitRepo() { return fs.existsSync(path.join(process.cwd(), '.git')); }

function getCurrentBranch() {
    const res = runGit('rev-parse --abbrev-ref HEAD', true);
    return res.success ? res.output : 'main';
}

function isVSCodeAvailable() {
    try { execSync('code --version', { stdio: 'ignore' }); return true; } catch { return false; }
}

// ==========================================
// 🚀 COMMANDS
// ==========================================
async function cmdSetup() {
    log('\n🛠️  Setting up GitZen for your project...\n', c.bold);
    if (!isGitRepo()) {
        info('Initializing Git repository...');
        runGit('init -b main', true);
        success('Git initialized!');
    } else { success('Git repository already exists.'); }

    const userName = execSync('git config user.name || echo ""', { encoding: 'utf8' }).trim();
    if (!userName) {
        const name = await ask('Enter your name for Git commits: ');
        const email = await ask('Enter your email for Git commits: ');
        runGit(`config user.name "${name}"`, true);
        runGit(`config user.email "${email}"`, true);
        success('Git identity configured!');
    }

    const ignorePath = path.join(process.cwd(), '.gitignore');
    if (!fs.existsSync(ignorePath)) {
        fs.writeFileSync(ignorePath, `node_modules/\ndist/\nbuild/\n.env\n.env.local\n*.log\n.DS_Store`);
        success('Created a standard Node.js .gitignore file.');
    }

    const remoteRes = runGit('remote get-url origin', true);
    if (!remoteRes.success) {
        log('\n🔗 Let\'s connect this to GitHub.', c.bold);
        const repoUrl = await ask('Paste your GitHub repository URL here (or press Enter to skip): ');
        if (repoUrl) { runGit(`remote add origin ${repoUrl}`, true); success('Remote origin added!'); }
    } else { success(`Already connected to: ${remoteRes.output}`); }

    log('\n🎉 Setup complete!\n', c.bold + c.green);
}

async function cmdSave() {
    log('\n💾 Preparing to save your work locally...\n', c.bold);
    const status = runGit('status --porcelain', true);
    if (!status.output) { warn('No changes detected.'); return; }

    let msg = await ask('\nCommit message (press Enter to auto-generate): ');
    if (!msg) msg = `Update ${status.output.split('\n').length} file(s)`;

    runGit('add .');
    const isMerging = fs.existsSync(path.join(process.cwd(), '.git', 'MERGE_HEAD'));
    const commitCmd = isMerging ? `commit --no-edit` : `commit -m "${msg.replace(/"/g, '\\"')}"`;
    
    const commitRes = runGit(commitCmd, true);
    if (!commitRes.success) { error('Commit failed: ' + commitRes.output); return; }
    success(`Successfully saved locally! 💾`);
}

// ==========================================
// 📂 AI DEBUGGING HELPERS
// ==========================================
async function cmdChangedFiles() {
    log('\n📂 Files modified/created since last commit:\n', c.bold);
    
    const trackedRes = runGit('diff --name-only --diff-filter=d HEAD', true);
    const untrackedRes = runGit('ls-files --others --exclude-standard', true);

    let files = [];
    if (trackedRes.success && trackedRes.output) files.push(...trackedRes.output.split('\n'));
    if (untrackedRes.success && untrackedRes.output) files.push(...untrackedRes.output.split('\n'));
    files = files.filter(Boolean);

    if (files.length === 0) {
        warn('No files modified since the last commit!');
        return;
    }

    log(`${c.dim}Found ${files.length} file(s):${c.reset}\n`);
    files.forEach((f, i) => log(`  ${c.yellow}${i + 1}${c.reset}) ${f}`));
    log(`\n${c.green}💡 Pro-tip: Use the "Generate AI Context" option to format these for your AI!${c.reset}\n`);
}

async function cmdGenerateAIContext() {
    log('\n🤖 Generating AI Debugging Context...\n', c.bold);
    
    const trackedRes = runGit('diff --name-only --diff-filter=d HEAD', true);
    const untrackedRes = runGit('ls-files --others --exclude-standard', true);

    let files = [];
    if (trackedRes.success && trackedRes.output) files.push(...trackedRes.output.split('\n'));
    if (untrackedRes.success && untrackedRes.output) files.push(...untrackedRes.output.split('\n'));
    files = files.filter(Boolean);

    if (files.length === 0) {
        warn('No files modified since the last commit!');
        return;
    }

    // 🌟 NEW: Ask user how they want the output
    const outputChoice = await selectMenu('How would you like to get the AI context?', [
        '📄 Save to a Markdown file (.md)',
        '🖥️  Print to Terminal (Copy/Paste)'
    ]);

    if (outputChoice === null) return; // User cancelled

    // Build the Markdown content string once
    let mdContent = `I am working on a feature and introduced a bug. Here are the files I have modified/created since my last working commit. Please review them and help me find the issue:\n\n`;

    for (const file of files) {
        try {
            const content = fs.readFileSync(file, 'utf8');
            const ext = path.extname(file).replace('.', '');
            mdContent += `### File: ${file}\n`;
            mdContent += `\`\`\`${ext || 'text'}\n${content}\n\`\`\`\n\n`;
        } catch (e) {
            mdContent += `### File: ${file}\n*Could not read file (might be binary or missing)*\n\n`;
        }
    }

    // Handle output based on user choice
    if (outputChoice === 0) {
        // 🌟 SAVE TO FILE
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const fileName = `gitzen-ai-context-${timestamp}.md`;
        const filePath = path.join(process.cwd(), fileName);

        try {
            fs.writeFileSync(filePath, mdContent, 'utf8');
            success(`Context saved to: ${c.bold}${fileName}`);
            info('You can now open this file, copy its contents, and paste it into your AI.');
        } catch (e) {
            error(`Failed to write file: ${e.message}`);
        }
    } else {
        // 🌟 PRINT TO TERMINAL
        log(`${c.dim}Reading ${files.length} files... (This will be printed below for you to copy)${c.reset}\n`);
        log(`${c.gray}──────────────────────────────────────────────────${c.reset}`);
        log(`${c.green}Copy everything below this line and paste it into your AI:${c.reset}\n`);
        log(mdContent);
        log(`${c.gray}──────────────────────────────────────────────────${c.reset}`);
        log(`\n${c.green}✅ Context generated! Copy the text above and paste it into your AI.${c.reset}\n`);
    }
}

// ==========================================
// 🪄 SMART PUSH & CONFLICT RESOLUTION
// ==========================================
async function cmdPush() {
    log('\n🚀 Pushing your local saves to GitHub...\n', c.bold);
    const branch = getCurrentBranch();
    const pushRes = runGit(`push -u origin ${branch}`, true);

    if (pushRes.success) {
        success(`Successfully synced with GitHub! 🎉`);
    } else if (pushRes.output.includes('rejected') || pushRes.output.includes('fetch first')) {
        warn('Push rejected! GitHub has files that we don\'t have locally.');
        const fixChoice = await selectMenu('How would you like to fix this?', [
            '🪄 Smart Merge (Download and combine safely)',
            '💥 Overwrite GitHub (Force push)',
            '🛑 Cancel'
        ]);

        if (fixChoice === 0) {
            if (await smartMerge(branch)) {
                const retryRes = runGit(`push -u origin ${branch}`, true);
                if (retryRes.success) success(`Synced after merging! 🎉`);
                else error('Push still failed.');
            }
        } else if (fixChoice === 1) {
            const confirm = await ask('Type "yes" to overwrite GitHub: ');
            if (confirm.toLowerCase() === 'yes') {
                runGit(`push --force -u origin ${branch}`, true);
                success(`GitHub overwritten! 🎉`);
            }
        }
    } else {
        error('Push failed.'); log(pushRes.output, c.gray);
    }
}

async function smartMerge(branch) {
    log('\n🪄 Attempting Smart Merge...\n', c.bold);
    let pullRes = runGit(`pull origin ${branch} --no-edit`, true);
    
    if (pullRes.success) { success('Merged successfully!'); return true; }
    
    if (pullRes.output.includes('CONFLICT') || pullRes.output.includes('could not apply')) {
        error('Conflict detected! Let\'s fix it together.');
        return await resolveConflictsInteractively();
    }
    
    error('Smart Merge failed.'); log(pullRes.output, c.gray);
    runGit('merge --abort', true);
    return false;
}

// ==========================================
// ⚔️  INTERACTIVE CONFLICT RESOLVER (The Magic)
// ==========================================
async function resolveConflictsInteractively() {
    log('\n⚔️  Interactive Conflict Resolver\n', c.bold);
    while (true) {
        const unmergedRes = runGit('diff --name-only --diff-filter=U', true);
        const unmergedFiles = unmergedRes.output.split('\n').filter(Boolean);

        if (unmergedFiles.length === 0) {
            success('All conflicts resolved! 🎉');
            info('Finishing the merge...');
            runGit('add .', true);
            
            const isMerging = fs.existsSync(path.join(process.cwd(), '.git', 'MERGE_HEAD'));
            const isRebasing = fs.existsSync(path.join(process.cwd(), '.git', 'rebase-merge'));
            if (isMerging) runGit('commit --no-edit', true);
            else if (isRebasing) runGit('rebase --continue', true);
            return true;
        }

        log(`You have ${unmergedFiles.length} conflicted file(s):`, c.yellow);
        unmergedFiles.forEach((f, i) => log(`  ${c.yellow}${i + 1}${c.reset}) ${f}`, c.reset));
        log(`  ${c.gray}0) Abort merge and give up${c.reset}\n`);

        const fileAns = await ask('Select a file to resolve (or 0 to abort): ');
        const fileIdx = parseInt(fileAns);

        if (fileIdx === 0) {
            if ((await ask('Abort merge? (yes/no): ')).toLowerCase() === 'yes') {
                runGit('merge --abort', true); return false;
            }
            continue;
        }

        if (fileIdx > 0 && fileIdx <= unmergedFiles.length) {
            await resolveFile(unmergedFiles[fileIdx - 1]);
        }
    }
}

async function resolveFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const conflictRegex = /<<<<<<<[^\n]*\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>>[^\n]*\n?/g;
    const match = conflictRegex.exec(content);
    const hasVSCode = isVSCodeAvailable();

    if (match) {
        log(`\n${c.yellow}⚠️ Conflict detected${c.reset}`);
        log(`\n${c.bold}File:${c.reset} ${filePath}`);
        log(`\n${c.gray}──────────────────────────${c.reset}`);
        log(`${c.green}🟢 Your Version${c.reset}\n`);
        log(match[1].trim());
        log(`\n${c.gray}──────────────────────────${c.reset}`);
        log(`${c.blue}🔵 GitHub Version${c.reset}\n`);
        log(match[2].trim());
        log(`${c.gray}──────────────────────────${c.reset}\n`);
    }

    const choices = [
        '🟢 Keep Mine (Accept your local changes)',
        '🔵 Keep GitHub (Accept incoming changes)'
    ];
    if (hasVSCode) choices.push('📝 Open VS Code Merge Editor (Recommended for manual combination)');
    else choices.push('📝 Open in Default Editor');
    choices.push('🔙 Back to file list');

    while (true) {
        const action = await selectMenu(`How would you like to resolve this?`, choices);
        if (action === null || action === choices.length - 1) return;

        if (action === 0) { 
            runGit(`checkout --ours "${filePath}"`, true);
            runGit(`add "${filePath}"`, true);
            success(`Kept your version!`); return;
        }
        if (action === 1) { 
            runGit(`checkout --theirs "${filePath}"`, true);
            runGit(`add "${filePath}"`, true);
            success(`Kept GitHub version!`); return;
        }

        if (action === 2) {
            if (hasVSCode) {
                info('Opening VS Code Merge Editor...');
                log('Use the buttons in VS Code to resolve. Save when done.', c.gray);
                try { execSync(`code --wait --merge "${filePath}"`, { stdio: 'inherit' }); } catch(e) {}
            } else {
                info('Opening in default editor...');
                const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
                try { execSync(`${cmd} "${filePath}"`, { stdio: 'ignore' }); } catch(e) {}
                await ask('Press Enter when you have saved and closed the file...');
            }

            const newContent = fs.readFileSync(filePath, 'utf8');
            if (!newContent.includes('<<<<<<<')) {
                runGit(`add "${filePath}"`, true);
                success(`Conflict resolved!`); return;
            } else {
                warn('Conflict markers still detected. Please ensure you saved in the editor.');
            }
        }
    }
}

// ==========================================
// 🆘 ABORT, UNDO, HISTORY, CLEANUP, SWITCH
// ==========================================
async function cmdAbort() {
    log('\n🛑 Aborting messy merge...\n', c.bold);
    if ((await ask('Are you sure? (yes/no): ')).toLowerCase() === 'yes') {
        runGit('merge --abort', true); runGit('rebase --abort', true);
        success('Aborted! Files are back to normal.');
    }
}

async function cmdUndo() {
    log('\n⏪ Time Machine...\n', c.bold);
    const logRes = runGit('log -n 10 --pretty=format:"%H|%ad|%s" --date=short', true);
    if (!logRes.output) { warn('No history.'); return; }

    const commits = logRes.output.split('\n').filter(Boolean);
    const idx = await selectMenu('Select a save to revert to:', commits.map(c => c.split('|')[2]));
    if (idx === null) return;

    const hash = commits[idx].split('|')[0];
    const backup = `gitzen-safety-${Date.now()}`;
    runGit(`branch ${backup}`, true);
    runGit(`reset --hard ${hash}`, true);
    success(`Reverted! Safety backup: ${backup}`);
}

async function cmdHistory() {
    log('\n📜 Project History\n', c.bold);
    const logRes = runGit('log --pretty=format:"%h | %ad | %s" --date=format:"%Y-%m-%d %H:%M"', true);
    if (!logRes.output) { warn('No history.'); return; }

    logRes.output.split('\n').forEach(line => {
        const p = line.split(' | ');
        console.log(`${c.yellow}${p[0]}${c.reset} | ${c.cyan}${p[1]}${c.reset} | ${p[2]}`);
    });
}

async function cmdCleanup() {
    log('\n🧹 Cleaning up temporary branches...\n', c.bold);
    const branches = runGit('branch --format="%(refname:short)"', true).output.split('\n').filter(b => b.startsWith('gitzen-'));
    
    if (branches.length === 0) { success('Already clean! ✨'); return; }

    const action = await selectMenu(`Found ${branches.length} temp branches.`, ['🗑️ Delete ALL', '🎯 Delete SPECIFIC', 'Cancel']);
    if (action === null || action === 2) return;

    if (getCurrentBranch().startsWith('gitzen-')) runGit('checkout main', true);

    if (action === 0) {
        if ((await ask(`Delete all ${branches.length} branches? (yes/no): `)).toLowerCase() === 'yes') {
            branches.forEach(b => runGit(`branch -D ${b}`, true));
            success(`Deleted ${branches.length} branches! 🗑️`);
        }
    } else {
        const idx = await selectMenu('Select branch:', branches);
        if (idx !== null && (await ask('Are you sure? (yes/no): ')).toLowerCase() === 'yes') {
            runGit(`branch -D ${branches[idx]}`, true);
            success(`Deleted ${branches[idx]}! 🗑️`);
        }
    }
}

async function cmdSwitch() {
    log('\n🔀 Time Travel & Switching\n', c.bold);
    const action = await selectMenu('What would you like to do?', [
        '🏠 Return to latest version (Main)',
        '🕰️ Travel to past version',
        '🌿 Switch between branches',
        '🧹 Clean up temporary branches'
    ]);

    if (action === null) return;

    if (action === 0) {
        if (getCurrentBranch() === 'main') { success('Already on main!'); return; }
        const current = getCurrentBranch();
        let keep = true;
        if (current.startsWith('gitzen-view-')) {
            const choice = await selectMenu(`Viewing: ${current}`, ['Keep branch', 'Delete branch', 'Cancel']);
            if (choice === null || choice === 2) return;
            keep = choice === 0;
        }
        runGit('checkout main', true);
        success('✅ Returned to main.');
        if (!keep) { runGit(`branch -D ${current}`, true); success('🗑 Temp branch deleted.'); }
    }
    else if (action === 1) {
        const commits = runGit('log -n 15 --pretty=format:"%H|%ad|%s" --date=short', true).output.split('\n').filter(Boolean);
        const idx = await selectMenu('Travel to:', commits.map(c => `${c.split('|')[1]} ${c.split('|')[2]}`));
        if (idx !== null) {
            const hash = commits[idx].split('|')[0];
            runGit(`checkout -b gitzen-view-${hash.substring(0,7)} ${hash}`, true);
            success('Viewing past version! 👀');
        }
    }
    else if (action === 2) {
        const branches = runGit('branch --format="%(refname:short)"', true).output.split('\n').filter(b => b && b !== getCurrentBranch());
        const idx = await selectMenu('Switch to:', branches);
        if (idx !== null) { runGit(`checkout ${branches[idx]}`, true); success(`Switched to ${branches[idx]}!`); }
    }
    else if (action === 3) { await cmdCleanup(); }
}

// ==========================================
// 🏠 MAIN MENU
// ==========================================
async function main() {
    console.log(`\n${c.bold}${c.magenta}GitZen${c.reset} ${c.dim}- Frictionless Git${c.reset}\n`);
    if (!isGitRepo()) { await cmdSetup(); return; }

    const action = process.argv[2];
    if (action) {
        if (action === 'setup') return cmdSetup();
        if (action === 'save') return cmdSave();
        if (action === 'push') return cmdPush();
        if (action === 'undo') return cmdUndo();
        if (action === 'history') return cmdHistory();
        if (action === 'changed') return cmdChangedFiles();
        if (action === 'context') return cmdGenerateAIContext();
        if (action === 'abort') return cmdAbort();
        if (action === 'switch') return cmdSwitch();
        if (action === 'cleanup') return cmdCleanup();
    }

    const choice = await selectMenu('What would you like to do?', [
        '💾 Save (Local Commit)',
        '🚀 Push (Sync to GitHub)',
        '🔀 Switch (Time Travel / Branches)',
        '⏪ Undo (Revert to previous save)',
        '📜 History (View past saves)',
        '📂 List Changed Files (For AI)',
        '🤖 Generate AI Context (File/Terminal)',
        '🧹 Cleanup (Delete temp branches)',
        '🛑 Abort (Cancel messy merge)',
        '🛠️  Setup (Re-configure)'
    ]);

    if (choice === 0) await cmdSave();
    else if (choice === 1) await cmdPush();
    else if (choice === 2) await cmdSwitch();
    else if (choice === 3) await cmdUndo();
    else if (choice === 4) await cmdHistory();
    else if (choice === 5) await cmdChangedFiles();
    else if (choice === 6) await cmdGenerateAIContext();
    else if (choice === 7) await cmdCleanup();
    else if (choice === 8) await cmdAbort();
    else if (choice === 9) await cmdSetup();

    rl.close();
}

main().catch(err => { error(err.message); rl.close(); });