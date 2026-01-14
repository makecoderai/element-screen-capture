/**
 * Popup 控制脚本
 * 负责与 content script 通信，控制截图流程
 */

const startBtn = document.getElementById('startBtn');
const cancelBtn = document.getElementById('cancelBtn');
const statusEl = document.getElementById('status');
const statusText = statusEl.querySelector('.status-text');
const progressBar = statusEl.querySelector('.progress-bar');
const progressFill = statusEl.querySelector('.progress-fill');

/**
 * 更新状态显示
 */
function updateStatus(text, type = 'normal', progress = null) {
  statusEl.classList.remove('hidden', 'capturing', 'success', 'error');
  if (type !== 'normal') {
    statusEl.classList.add(type);
  }
  statusText.textContent = text;

  if (progress !== null) {
    progressBar.classList.remove('hidden');
    progressFill.style.width = `${progress}%`;
  } else {
    progressBar.classList.add('hidden');
  }
}

/**
 * 重置 UI 状态
 */
function resetUI() {
  startBtn.disabled = false;
  startBtn.classList.remove('hidden');
  cancelBtn.classList.add('hidden');
  statusEl.classList.add('hidden');
}

/**
 * 获取当前活动标签页
 */
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/**
 * 向 content script 发送消息
 */
async function sendMessage(type, data = {}) {
  const tab = await getCurrentTab();
  return chrome.tabs.sendMessage(tab.id, { type, ...data });
}

/**
 * 注入 content script（如果尚未注入）
 */
async function ensureContentScriptInjected() {
  const tab = await getCurrentTab();

  try {
    // 尝试发送一个 ping 消息来检查 content script 是否已加载
    await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
  } catch (e) {
    // Content script 未加载，注入它
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/content.js']
    });

    // 注入样式
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['styles/inspector.css']
    });

    // 等待 content script 初始化
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

/**
 * 开始选择模式
 */
async function startInspector() {
  try {
    await ensureContentScriptInjected();
    await sendMessage('START_INSPECTOR');

    updateStatus('正在选择元素...', 'normal');
    startBtn.disabled = true;
    cancelBtn.classList.remove('hidden');

    // Popup 保持打开，监听消息
  } catch (error) {
    console.error('Failed to start inspector:', error);
    updateStatus('启动失败: ' + error.message, 'error');
  }
}

/**
 * 取消选择
 */
async function cancelInspector() {
  try {
    await sendMessage('CANCEL_INSPECTOR');
    resetUI();
  } catch (error) {
    console.error('Failed to cancel:', error);
  }
}

// 事件监听
startBtn.addEventListener('click', startInspector);
cancelBtn.addEventListener('click', cancelInspector);

// 监听来自 content script / background 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'ELEMENT_SELECTED':
      updateStatus('元素已选择，准备截图...', 'capturing');
      break;

    case 'CAPTURE_PROGRESS':
      updateStatus(
        `正在截图 ${message.current}/${message.total}...`,
        'capturing',
        (message.current / message.total) * 100
      );
      break;

    case 'STITCHING':
      updateStatus('正在拼接图片...', 'capturing', 100);
      break;

    case 'CAPTURE_COMPLETE':
      updateStatus('截图完成！已保存到下载目录', 'success');
      setTimeout(resetUI, 2000);
      break;

    case 'CAPTURE_ERROR':
      updateStatus('截图失败: ' + message.error, 'error');
      setTimeout(resetUI, 3000);
      break;

    case 'INSPECTOR_CANCELLED':
      resetUI();
      break;
  }

  sendResponse({ received: true });
  return true;
});

// 监听快捷键（在 popup 内）
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    cancelInspector();
  }
});
