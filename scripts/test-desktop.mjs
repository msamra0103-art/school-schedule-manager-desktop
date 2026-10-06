import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const required = [
  'desktop/main.cjs',
  '.github/workflows/build-windows-setup.yml',
  'site/index.html',
  'site/app.js',
  'site/bootstrap.js',
  'site/supabase-config.js',
  'site/vendor/supabase.js',
  'site/styles.css',
  'site/assets/ministry-logo.png',
  'site/assets/نموذج-البيانات-الأساسية-المعتمد.xlsx'
];

for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Desktop package is missing: ${file}`);
}

const pkg = JSON.parse(read('package.json'));
if (pkg.main !== 'desktop/main.cjs') throw new Error('Electron main entry is not configured.');
if (!pkg.scripts?.['desktop:dist']) throw new Error('Windows setup build script is missing.');
if (!pkg.build?.extraResources?.some(item => item.from === 'site')) throw new Error('Site resources are not packaged.');

const main = read('desktop/main.cjs');
const bootstrap = read('site/bootstrap.js');
const app = read('site/app.js');
const workflow = read('.github/workflows/build-windows-setup.yml');
if (!main.includes("school-schedule://app/index.html")) throw new Error('Stable desktop origin is missing.');
if (!main.includes('validateFiles(paths)')) throw new Error('Startup file validation is missing.');
if (!main.includes('startup.log')) throw new Error('Startup diagnostics are missing.');
if (!bootstrap.includes("client.rpc('claim_my_schedule_account')")) throw new Error('Supabase account binding is missing.');
if (!bootstrap.includes('window.SCHEDULE_API_FETCH')) throw new Error('Supabase API adapter is missing.');
if (!bootstrap.includes('offlineStart')) throw new Error('Offline fallback is missing.');
if (!app.includes("const LOCAL_MODE = window.LOCAL_MODE === true")) throw new Error('Local persistence mode is missing.');
if (!workflow.includes('اختبار فتح النسخة التنفيذية')) throw new Error('Windows runtime smoke test is missing.');
if (!workflow.includes('actions/upload-artifact@v4')) throw new Error('Setup artifact upload is missing.');

console.log(JSON.stringify({
  desktopAudit: 'passed',
  stableOrigin: true,
  cloudSync: true,
  offlineFallback: true,
  githubSetupWorkflow: true,
  startupDiagnostics: true,
  requiredFiles: required.length
}));
