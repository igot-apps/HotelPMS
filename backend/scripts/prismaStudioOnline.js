// Opens Prisma Studio against the online (Render) database.
// The connection string lives in backend/.env.online (git-ignored) as ONLINE_DATABASE_URL.
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.online'), quiet: true });

const url = process.env.ONLINE_DATABASE_URL?.trim();
if (!url) {
  console.error('ONLINE_DATABASE_URL is missing. Add it to backend/.env.online (Render > Postgres > Connect > External Database URL).');
  process.exit(1);
}

console.log('Opening Prisma Studio on the ONLINE database (live data) at http://localhost:5556 ...');
const studio = spawn('npx', ['prisma', 'studio', '--port', '5556'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, DATABASE_URL: url },
});
studio.on('exit', code => process.exit(code ?? 0));
