#!/usr/bin/env node
// Static check for phone-layout problems that hide or block buttons.
// Usage (from the repo root):
//   node .agents/skills/mobile-layout/scripts/check-mobile-layout.mjs            -> whole frontend/src
//   node .agents/skills/mobile-layout/scripts/check-mobile-layout.mjs <file|dir>  -> only those files
// Exit code 1 when an error is found; warnings alone exit 0.
// Wrappers that trap dialogs (transform, filter, contain...) can't be judged from source; use probe-dialog.js in the browser.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const root = process.cwd();
const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['frontend/src'];
const exts = new Set(['.jsx', '.tsx', '.js', '.ts', '.css']);

const files = [];
const walk = path => {
  if (!existsSync(path)) { console.error(`Not found: ${path}`); process.exitCode = 2; return; }
  if (statSync(path).isDirectory()) {
    for (const name of readdirSync(path)) if (!['node_modules', 'dist', 'generated'].includes(name)) walk(join(path, name));
  } else if (exts.has(extname(path))) files.push(path);
};
targets.forEach(walk);

// Things that make an overlay count as a dialog (the tab bar hides for these, see index.css).
const DIALOG_MARK = /role="(dialog|alertdialog)"|aria-modal|mobile-dialog-overlay|<dialog\b|createPortal/;

const rules = [
  { id: 'ios-scroll-trap', level: 'error', test: /-webkit-overflow-scrolling/,
    msg: 'On iOS this traps fixed dialogs inside the scroll area, so headers/tab bar cover their buttons. Remove it.' },
  { id: 'vh-height', level: 'warn', test: /\b(?:max-h|h)-\[[^\]]*\d+vh[^\]]*\]|\bmax-h-screen\b|(?:^|[\s:;])(?:max-)?height:\s*[^;]*\b\d+vh/,
    msg: 'vh is taller than the visible screen on phones (browser bars). Use dvh, e.g. max-h-[calc(100dvh-2rem)].' },
];

let errors = 0; let warnings = 0;
const report = (file, line, level, id, msg) => {
  level === 'error' ? errors++ : warnings++;
  console.log(`${relative(root, file)}:${line}  ${level.toUpperCase()}  ${id}  ${msg}`);
};

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const rule of rules) {
      if (rule.test.test(line)) report(file, i + 1, rule.level, rule.id, rule.msg);
    }
    // Full-screen overlay that is not marked as a dialog: the phone tab bar will not step aside for it.
    if (/fixed inset-0/.test(line) && !/md:hidden/.test(line)) {
      const around = lines.slice(Math.max(0, i - 5), i + 4).join('\n');
      if (!DIALOG_MARK.test(around)) report(file, i + 1, 'warn', 'unmarked-overlay', 'Full-screen overlay without role="dialog" aria-modal="true" (or mobile-dialog-overlay): the tab bar stays on top of it.');
    }
    // A dialog panel with no height cap and no scrolling can push its buttons off the bottom of the screen.
    if (/fixed inset-0/.test(line) && !/md:hidden/.test(line) && !/overflow-y-auto|overflow-auto|mobile-dialog-overlay|<dialog\b|dvh|\bh-full\b/.test(lines.slice(Math.max(0, i - 5), i + 6).join('\n'))) {
      report(file, i + 1, 'warn', 'no-scroll', 'Overlay and its panel do not scroll: on a short screen the bottom buttons can be unreachable. Add max-h-[calc(100dvh-2rem)] overflow-y-auto to the panel or use mobile-dialog-overlay.');
    }
  });
}

console.log(`\n${files.length} files checked · ${errors} error(s) · ${warnings} warning(s)`);
if (errors) process.exitCode = 1;
