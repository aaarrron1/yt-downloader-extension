/**
 * popup.js — YT Downloader & GitHub Auto-Push
 */

const $ = id => document.getElementById(id);

function log(msg, isErr = false) {
  const area = $('logArea');
  area.classList.add('visible');
  const line = document.createElement('div');
  if (isErr) line.className = 'log-err';
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  area.appendChild(line);
  area.scrollTop = area.scrollHeight;
}

function setStatus(type, text) {
  $('statusDot').className = 'status-dot' + (type ? ' ' + type : '');
  $('statusText').textContent = text;
}

function setProgress(pct, label) {
  $('progressSection').style.display = 'block';
  $('progressBar').style.width = pct + '%';
  if (label) $('progressLabel').textContent = label;
}

function hideProgress() {
  $('progressSection').style.display = 'none';
  $('progressBar').style.width = '0';
}

const KEYS = ['ghToken', 'ghOwner', 'ghRepo', 'ghPath', 'ghCommit', 'quality', 'format'];

async function loadSettings() {
  const data = await chrome.storage.local.get(KEYS);
  KEYS.forEach(k => { if (data[k]) $(k).value = data[k]; });
  if (!data.ghCommit) $('ghCommit').value = 'feat: add {title}';
}

async function saveSettings() {
  const obj = {};
  KEYS.forEach(k => { obj[k] = $(k).value.trim(); });
  await chrome.storage.local.set(obj);
  setStatus('ok', '设置已保存');
  setTimeout(() => detectPage(), 1500);
}

async function detectPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    const url = tab.url || '';
    if (!url.includes('youtube.com/watch')) {
      setStatus('', '请在 YouTube 视频页面使用');
      $('videoUrl').value = url.includes('youtube.com') ? url : '';
      return;
    }
    $('videoUrl').value = url;
    setStatus('ok', '检测到 YouTube 视频');
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { action: 'getVideoInfo' });
      if (res && res.title) {
        $('videoSection').style.display = 'block';
        $('videoTitle').textContent = res.title;
        $('tagDuration').textContent = res.duration || '—';
        $('tagChannel').textContent = res.channel || '—';
        $('tagDuration').className = 'tag green';
      }
    } catch (_) {}
  } catch (e) {
    setStatus('err', '获取页面信息失败');
  }
}

async function run(pushToGitHub) {
  const url     = $('videoUrl').value.trim();
  const token   = $('ghToken').value.trim();
  const owner   = $('ghOwner').value.trim();
  const repo    = $('ghRepo').value.trim();
  const path    = $('ghPath').value.trim() || 'videos';
  const tmpl    = $('ghCommit').value.trim() || 'feat: add {title}';
  const quality = $('quality').value;
  const format  = $('format').value;

  if (!url) { log('请填写视频 URL', true); return; }
  if (pushToGitHub && (!token || !owner || !repo)) {
    log('推送到 GitHub 需要填写 Token、用户名和仓库名', true); return;
  }

  $('btnRun').disabled = true;
  $('btnDownloadOnly').disabled = true;

  try {
    setStatus('run', '正在解析视频…');
    setProgress(5, '正在解析视频链接…');
    log(`开始处理: ${url}`);

    const videoInfo = await sendToBackground({ action: 'resolveVideo', url, quality, format });
    if (!videoInfo.success) throw new Error(videoInfo.error || '视频解析失败');

    log(`视频标题: ${videoInfo.title}`);
    log(`直链已获取，文件名: ${videoInfo.filename}`);
    setProgress(30, '正在下载视频…');
    setStatus('run', '正在下载视频文件…');

    const downloadResult = await sendToBackground({
      action: 'downloadVideo',
      downloadUrl: videoInfo.downloadUrl,
      filename: videoInfo.filename
    });
    if (!downloadResult.success) throw new Error(downloadResult.error || '下载失败');
    log(`下载完成: ${downloadResult.filename}`);
    setProgress(60, pushToGitHub ? '正在推送到 GitHub…' : '下载完成');

    if (pushToGitHub) {
      setStatus('run', '正在推送到 GitHub…');
      log(`推送到 ${owner}/${repo}/${path}/…`);
      const commitMsg = tmpl
        .replace('{title}', videoInfo.title)
        .replace('{filename}', videoInfo.filename)
        .replace('{date}', new Date().toISOString().slice(0, 10));

      const pushResult = await sendToBackground({
        action: 'pushToGitHub',
        token, owner, repo,
        filePath: `${path}/${videoInfo.filename}`,
        downloadUrl: videoInfo.downloadUrl,
        commitMsg
      });
      if (!pushResult.success) throw new Error(pushResult.error || 'GitHub 推送失败');
      log(`已推送: ${pushResult.commitUrl}`);
      setProgress(100, '全部完成');
      setStatus('ok', '下载并推送成功');
      chrome.notifications.create({
        type: 'basic', iconUrl: 'icons/icon48.png',
        title: 'YT Downloader',
        message: `已推送到 GitHub: ${owner}/${repo}`
      });
    } else {
      setProgress(100, '下载完成');
      setStatus('ok', '下载完成');
      chrome.notifications.create({
        type: 'basic', iconUrl: 'icons/icon48.png',
        title: 'YT Downloader', message: `视频已下载: ${videoInfo.filename}`
      });
    }
    setTimeout(hideProgress, 3000);
  } catch (e) {
    log(e.message, true);
    setStatus('err', '操作失败，查看日志');
    hideProgress();
  } finally {
    $('btnRun').disabled = false;
    $('btnDownloadOnly').disabled = false;
  }
}

function sendToBackground(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, response => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await detectPage();
  $('btnSave').addEventListener('click', saveSettings);
  $('btnRun').addEventListener('click', () => run(true));
  $('btnDownloadOnly').addEventListener('click', () => run(false));
});
