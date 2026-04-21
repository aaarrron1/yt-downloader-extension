/**
 * background.js — Service Worker
 * 视频解析 / 下载 / GitHub 推送
 */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.action) {
        case 'resolveVideo':
          sendResponse(await resolveVideo(msg.url, msg.quality, msg.format)); break;
        case 'downloadVideo':
          sendResponse(await downloadVideo(msg.downloadUrl, msg.filename)); break;
        case 'pushToGitHub':
          sendResponse(await pushToGitHub(msg)); break;
        default:
          sendResponse({ success: false, error: '未知操作' });
      }
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
  })();
  return true;
});

// ═══════════════════════════════════════
// 1. 解析视频直链（cobalt.tools API）
// ═══════════════════════════════════════
async function resolveVideo(youtubeUrl, quality, format) {
  const apiUrl = 'https://cobalt.tools/api/json';
  const body = {
    url: youtubeUrl,
    vCodec: 'h264',
    vQuality: quality === 'best' ? '4320' : quality,
    aFormat: 'mp3',
    isAudioOnly: format === 'mp3',
    isNoTTWatermark: true,
    isTTFullAudio: false,
    isAudioMuted: false,
    dubLang: false,
    disableMetadata: false
  };

  let resp;
  try {
    resp = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (_) {
    return await resolveVideoFallback(youtubeUrl, quality, format);
  }

  if (!resp.ok) return await resolveVideoFallback(youtubeUrl, quality, format);

  const data = await resp.json();
  if (data.status === 'stream' || data.status === 'redirect') {
    const videoId = extractVideoId(youtubeUrl);
    const ext = format === 'mp3' ? 'mp3' : 'mp4';
    const filename = sanitizeFilename(`youtube_${videoId}_${quality}p.${ext}`);
    return {
      success: true,
      downloadUrl: data.url,
      filename,
      title: data.videoName || `YouTube_${videoId}`,
      videoId
    };
  }
  return await resolveVideoFallback(youtubeUrl, quality, format);
}

async function resolveVideoFallback(youtubeUrl, quality, format) {
  const videoId = extractVideoId(youtubeUrl);
  if (!videoId) return { success: false, error: '无法提取视频 ID' };

  const mirrors = ['https://co.wuk.sh/api/json', 'https://cobalt.api.horse/api/json'];
  for (const mirror of mirrors) {
    try {
      const resp = await fetch(mirror, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ url: youtubeUrl, vQuality: quality === 'best' ? '1080' : quality, isAudioOnly: format === 'mp3' })
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      if (data.status === 'stream' || data.status === 'redirect') {
        const ext = format === 'mp3' ? 'mp3' : 'mp4';
        return {
          success: true,
          downloadUrl: data.url,
          filename: sanitizeFilename(`youtube_${videoId}_${quality}p.${ext}`),
          title: data.videoName || `YouTube_${videoId}`,
          videoId
        };
      }
    } catch (_) { continue; }
  }
  return { success: false, error: '所有解析服务均不可用，请检查网络或稍后重试' };
}

// ═══════════════════════════════════════
// 2. 下载视频到本地
// ═══════════════════════════════════════
async function downloadVideo(downloadUrl, filename) {
  return new Promise((resolve) => {
    chrome.downloads.download(
      { url: downloadUrl, filename, saveAs: false },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        const listener = (delta) => {
          if (delta.id !== downloadId) return;
          if (delta.state && delta.state.current === 'complete') {
            chrome.downloads.onChanged.removeListener(listener);
            resolve({ success: true, filename, downloadId });
          } else if (delta.state && delta.state.current === 'interrupted') {
            chrome.downloads.onChanged.removeListener(listener);
            resolve({ success: false, error: '下载被中断，请检查磁盘空间和网络' });
          }
        };
        chrome.downloads.onChanged.addListener(listener);
        setTimeout(() => {
          chrome.downloads.onChanged.removeListener(listener);
          resolve({ success: true, filename, downloadId, note: '下载仍在进行中' });
        }, 300_000);
      }
    );
  });
}

// ═══════════════════════════════════════
// 3. 推送到 GitHub（Contents API + Base64）
// ═══════════════════════════════════════
async function pushToGitHub({ token, owner, repo, filePath, downloadUrl, commitMsg }) {
  const apiBase = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
  const headers = {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28'
  };

  let fileBase64;
  try {
    const resp = await fetch(downloadUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buffer = await resp.arrayBuffer();
    fileBase64 = arrayBufferToBase64(buffer);
  } catch (e) {
    return { success: false, error: `读取视频数据失败: ${e.message}` };
  }

  let existingSha = null;
  try {
    const checkResp = await fetch(apiBase, { headers });
    if (checkResp.ok) {
      const existing = await checkResp.json();
      existingSha = existing.sha;
    }
  } catch (_) {}

  const body = {
    message: commitMsg,
    content: fileBase64,
    ...(existingSha ? { sha: existingSha } : {})
  };

  const putResp = await fetch(apiBase, { method: 'PUT', headers, body: JSON.stringify(body) });
  if (!putResp.ok) {
    const errData = await putResp.json().catch(() => ({}));
    return { success: false, error: `GitHub API ${putResp.status}: ${errData.message || putResp.statusText}` };
  }

  const result = await putResp.json();
  const commitUrl = result.commit?.html_url || `https://github.com/${owner}/${repo}`;
  return { success: true, commitUrl, sha: result.content?.sha };
}

// ── 工具函数 ──
function extractVideoId(url) {
  const patterns = [/[?&]v=([^&#]+)/, /youtu\.be\/([^?&]+)/, /embed\/([^?&]+)/, /shorts\/([^?&]+)/];
  for (const re of patterns) { const m = url.match(re); if (m) return m[1]; }
  return null;
}

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 200);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

console.log('[YT Downloader] background service worker started');
