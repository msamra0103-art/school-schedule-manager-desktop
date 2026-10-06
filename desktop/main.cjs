'use strict';

const { app, BrowserWindow, dialog, shell, protocol, net } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

let mainWindow = null;
let logFile = '';

protocol.registerSchemesAsPrivileged([{scheme:'school-schedule',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}}]);

function appendLog(message, error) {
  try {
    const details = error ? `\n${error.stack || error.message || String(error)}` : '';
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}${details}\n`, 'utf8');
  } catch (_) {}
}

function appPaths() {
  const root = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '..');
  return { site: path.join(root, 'site') };
}

function validateFiles(paths) {
  const required = [
    path.join(paths.site, 'index.html'),
    path.join(paths.site, 'app.js'),
    path.join(paths.site, 'styles.css'),
    path.join(paths.site, 'bootstrap.js'),
    path.join(paths.site, 'supabase-config.js'),
    path.join(paths.site, 'vendor', 'supabase.js')
  ];
  const missing = required.filter(file => !fs.existsSync(file));
  if (missing.length) throw new Error(`ملفات الواجهة غير مكتملة:\n${missing.join('\n')}`);
}

function safeFile(root, urlPath) {
  const requested = decodeURIComponent(urlPath.split('?')[0]);
  const relative = requested === '/' ? 'index.html' : requested.replace(/^\/+/, '');
  const resolved = path.resolve(root, relative);
  const base = `${path.resolve(root)}${path.sep}`;
  if (resolved !== path.resolve(root) && !resolved.startsWith(base)) return null;
  return resolved;
}

function registerLocalProtocol(paths) {
  protocol.handle('school-schedule', request => {
    try {
      const pathname = new URL(request.url).pathname;
      const file = safeFile(paths.site, pathname);
      if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        appendLog(`طلب ملف غير موجود: ${pathname}`);
        return new Response('الملف غير موجود', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      }
      return net.fetch(pathToFileURL(file).toString());
    } catch (error) {
      appendLog('خطأ في بروتوكول الواجهة المحلي', error);
      return new Response('تعذر تشغيل الواجهة', { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
  });
  appendLog('تم تسجيل عنوان التطبيق الداخلي الثابت');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'لوحة إدارة الجدول المدرسي',
    width: 1540,
    height: 940,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#eef4f8',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    appendLog(`فشل تحميل الواجهة (${code}) ${description} — ${url}`);
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => appendLog(`توقف محرك الواجهة: ${JSON.stringify(details)}`));
  mainWindow.on('unresponsive', () => appendLog('نافذة البرنامج لا تستجيب'));
  mainWindow.once('ready-to-show', () => {
    appendLog('الواجهة جاهزة للعرض');
    mainWindow.show();
    mainWindow.focus();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadURL('school-schedule://app/index.html').catch(error => appendLog('تعذر فتح عنوان الواجهة', error));
}

async function launch() {
  logFile = path.join(app.getPath('userData'), 'startup.log');
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  appendLog(`تشغيل الإصدار ${app.getVersion()} — packaged=${app.isPackaged}`);
  const paths = appPaths();
  validateFiles(paths);
  registerLocalProtocol(paths);
  createWindow();
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  process.on('uncaughtException', error => appendLog('خطأ غير معالج', error));
  process.on('unhandledRejection', error => appendLog('رفض Promise غير معالج', error));

  app.whenReady().then(launch).catch(error => {
    appendLog('تعذر بدء البرنامج', error);
    dialog.showErrorBox(
      'تعذر تشغيل لوحة إدارة الجدول المدرسي',
      `${error.message}\n\nسجل التشخيص:\n${logFile}`
    );
    app.quit();
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
