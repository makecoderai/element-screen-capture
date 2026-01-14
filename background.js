/**
 * Background Service Worker
 * 负责截图、图片拼接和下载
 */

/**
 * 截取当前可见标签页
 * @param {number} tabId - 标签页 ID
 * @returns {Promise<string>} - 图片的 data URL
 */
async function captureVisibleTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  return chrome.tabs.captureVisibleTab(tab.windowId, {
    format: 'png',
    quality: 100
  });
}

/**
 * 将 data URL 转换为 ImageBitmap
 * @param {string} dataUrl - 图片的 data URL
 * @returns {Promise<ImageBitmap>}
 */
async function dataUrlToImageBitmap(dataUrl) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return createImageBitmap(blob);
}

/**
 * 检测两帧之间的重复像素行数
 * 用于处理 sticky header 重复问题
 * @param {ImageData} prevData - 前一帧底部的图像数据
 * @param {ImageData} currData - 当前帧顶部的图像数据
 * @param {number} maxOverlap - 最大检测重叠高度
 * @returns {number} - 检测到的重复行数
 */
function detectOverlap(prevData, currData, maxOverlap) {
  const width = prevData.width;
  const prevPixels = prevData.data;
  const currPixels = currData.data;

  // 采样点数量（不需要比较每个像素）
  const sampleCount = Math.min(width, 100);
  const sampleStep = Math.floor(width / sampleCount);

  // 从最大可能重叠开始向下搜索
  for (let overlap = maxOverlap; overlap >= 1; overlap--) {
    let matchCount = 0;
    let totalSamples = 0;

    // 比较 overlap 行
    for (let row = 0; row < overlap; row++) {
      const prevRow = prevData.height - overlap + row;
      const currRow = row;

      for (let sample = 0; sample < sampleCount; sample++) {
        const x = sample * sampleStep;

        // 前一帧底部的像素
        const prevIdx = (prevRow * width + x) * 4;
        // 当前帧顶部的像素
        const currIdx = (currRow * width + x) * 4;

        // 比较 RGB 值（允许少量误差，处理抗锯齿）
        const dr = Math.abs(prevPixels[prevIdx] - currPixels[currIdx]);
        const dg = Math.abs(prevPixels[prevIdx + 1] - currPixels[currIdx + 1]);
        const db = Math.abs(prevPixels[prevIdx + 2] - currPixels[currIdx + 2]);

        if (dr <= 5 && dg <= 5 && db <= 5) {
          matchCount++;
        }
        totalSamples++;
      }
    }

    // 如果 95% 以上的采样点匹配，认为是重复区域
    if (matchCount / totalSamples > 0.95) {
      return overlap;
    }
  }

  return 0;
}

/**
 * 拼接多帧截图
 * @param {Array} frames - 帧数据数组 [{ dataUrl, cropRegion }]
 * @param {Object} options - 拼接选项
 * @returns {Promise<Blob>} - 拼接后的图片 Blob
 */
async function stitchFrames(frames, options = {}) {
  if (frames.length === 0) {
    throw new Error('No frames to stitch');
  }

  const { detectDuplicates = true, maxOverlapHeight = 200 } = options;

  // 转换所有帧为 ImageBitmap
  const images = await Promise.all(
    frames.map(frame => dataUrlToImageBitmap(frame.dataUrl))
  );

  // 计算最终图片尺寸
  const firstCrop = frames[0].cropRegion;
  const outputWidth = Math.round(firstCrop.width);

  // 先裁剪所有帧
  const croppedFrames = [];
  for (let i = 0; i < frames.length; i++) {
    const img = images[i];
    const crop = frames[i].cropRegion;

    // 创建临时 canvas 进行裁剪
    const tempCanvas = new OffscreenCanvas(
      Math.round(crop.width),
      Math.round(crop.height)
    );
    const tempCtx = tempCanvas.getContext('2d');

    tempCtx.drawImage(
      img,
      Math.round(crop.x), Math.round(crop.y),
      Math.round(crop.width), Math.round(crop.height),
      0, 0,
      Math.round(crop.width), Math.round(crop.height)
    );

    croppedFrames.push({
      canvas: tempCanvas,
      ctx: tempCtx,
      width: Math.round(crop.width),
      height: Math.round(crop.height)
    });
  }

  // 检测重复区域并计算最终高度
  const overlaps = [0]; // 第一帧没有重叠

  if (detectDuplicates && croppedFrames.length > 1) {
    for (let i = 1; i < croppedFrames.length; i++) {
      const prev = croppedFrames[i - 1];
      const curr = croppedFrames[i];

      const checkHeight = Math.min(maxOverlapHeight, prev.height, curr.height);

      // 获取前一帧底部的像素数据
      const prevData = prev.ctx.getImageData(
        0, prev.height - checkHeight,
        prev.width, checkHeight
      );

      // 获取当前帧顶部的像素数据
      const currData = curr.ctx.getImageData(0, 0, curr.width, checkHeight);

      const overlap = detectOverlap(prevData, currData, checkHeight);
      overlaps.push(overlap);
    }
  } else {
    for (let i = 1; i < croppedFrames.length; i++) {
      overlaps.push(0);
    }
  }

  // 计算最终高度
  let totalHeight = 0;
  for (let i = 0; i < croppedFrames.length; i++) {
    totalHeight += croppedFrames[i].height - (i > 0 ? overlaps[i] : 0);
  }

  // 创建最终画布
  const finalCanvas = new OffscreenCanvas(outputWidth, totalHeight);
  const finalCtx = finalCanvas.getContext('2d');

  // 拼接
  let currentY = 0;
  for (let i = 0; i < croppedFrames.length; i++) {
    const frame = croppedFrames[i];
    const overlap = overlaps[i];

    // 从重叠区域之后开始绘制（第一帧从头开始）
    const sourceY = i === 0 ? 0 : overlap;
    const sourceHeight = frame.height - sourceY;

    finalCtx.drawImage(
      frame.canvas,
      0, sourceY,
      frame.width, sourceHeight,
      0, currentY,
      frame.width, sourceHeight
    );

    currentY += sourceHeight;
  }

  // 导出为 Blob
  return finalCanvas.convertToBlob({ type: 'image/png' });
}

/**
 * 将 Blob 转换为 data URL
 * @param {Blob} blob - 图片 Blob
 * @returns {Promise<string>} - data URL
 */
async function blobToDataUrl(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return `data:${blob.type};base64,${base64}`;
}

/**
 * 下载图片
 * @param {Blob} blob - 图片 Blob
 * @param {string} filename - 文件名
 */
async function downloadImage(blob, filename) {
  // Service Worker 中没有 URL.createObjectURL，使用 data URL
  const dataUrl = await blobToDataUrl(blob);

  await chrome.downloads.download({
    url: dataUrl,
    filename: filename,
    saveAs: false
  });
}

// 消息处理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  switch (message.type) {
    case 'CAPTURE_FRAME':
      // 截取当前可见区域
      captureVisibleTab(tabId)
        .then(dataUrl => {
          sendResponse({ success: true, dataUrl });
        })
        .catch(error => {
          sendResponse({ success: false, error: error.message });
        });
      return true; // 异步响应

    case 'STITCH_AND_DOWNLOAD':
      // 拼接并下载
      console.log('[ESC Background] Received STITCH_AND_DOWNLOAD', message.frames?.length, 'frames');
      (async () => {
        try {
          console.log('[ESC Background] Starting stitch...');
          const blob = await stitchFrames(message.frames, message.options);
          console.log('[ESC Background] Stitch complete, blob size:', blob.size);

          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const filename = `element-capture-${timestamp}.png`;
          console.log('[ESC Background] Downloading:', filename);

          await downloadImage(blob, filename);
          console.log('[ESC Background] Download initiated');

          // 通知 content script 完成
          chrome.tabs.sendMessage(tabId, { type: 'CAPTURE_COMPLETE' });
          sendResponse({ success: true });
        } catch (error) {
          console.error('[ESC Background] Error:', error);
          chrome.tabs.sendMessage(tabId, {
            type: 'CAPTURE_ERROR',
            error: error.message
          });
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true; // 异步响应
  }
});

// 扩展安装/更新时的处理
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Element Screen Capture installed:', details.reason);
});
