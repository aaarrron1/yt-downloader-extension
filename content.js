/**
 * content.js — 注入到 YouTube 页面，抓取视频信息
 */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getVideoInfo') {
    try {
      const title = document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string')?.textContent?.trim()
                 || document.title.replace(' - YouTube', '').trim()
                 || '未知标题';
      const duration = document.querySelector('.ytp-time-duration')?.textContent?.trim() || '—';
      const channel  = document.querySelector('#channel-name a')?.textContent?.trim()
                     || document.querySelector('ytd-channel-name a')?.textContent?.trim()
                     || '—';
      sendResponse({ title, duration, channel });
    } catch (e) {
      sendResponse({ title: document.title, duration: '—', channel: '—' });
    }
    return true;
  }
});
