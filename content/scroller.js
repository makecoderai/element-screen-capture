/**
 * 滚动截图控制器 (Scroller)
 * 负责控制目标元素滚动、分帧截图、计算裁剪区域
 */

class Scroller {
  constructor() {
    this.progressIndicator = null;
  }

  /**
   * 计算截图帧数和滚动步长
   */
  calculateFrames(element) {
    const rect = element.getBoundingClientRect();
    const clientHeight = element.clientHeight;
    const scrollHeight = element.scrollHeight;
    const scrollTop = element.scrollTop;

    // 可滚动的总高度
    const scrollableHeight = scrollHeight - clientHeight;

    if (scrollableHeight <= 0) {
      // 不需要滚动，只截一帧
      return {
        totalFrames: 1,
        frameHeight: clientHeight,
        scrollableHeight: 0,
        initialScrollTop: scrollTop
      };
    }

    // 每帧滚动的高度（留一些重叠以便拼接）
    // 使用 80% 的可见高度作为步长，留 20% 用于重叠检测
    const overlapRatio = 0.2;
    const effectiveHeight = clientHeight * (1 - overlapRatio);

    // 计算需要的帧数
    const totalFrames = Math.ceil(scrollableHeight / effectiveHeight) + 1;

    return {
      totalFrames,
      frameHeight: effectiveHeight,
      scrollableHeight,
      initialScrollTop: scrollTop,
      clientHeight
    };
  }

  /**
   * 计算当前帧的裁剪区域
   */
  calculateCropRegion(element) {
    const rect = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;

    // 计算元素在视口中的可见区域
    const visibleLeft = Math.max(0, rect.left);
    const visibleTop = Math.max(0, rect.top);
    const visibleRight = Math.min(viewportWidth, rect.right);
    const visibleBottom = Math.min(viewportHeight, rect.bottom);

    const visibleWidth = visibleRight - visibleLeft;
    const visibleHeight = visibleBottom - visibleTop;

    return {
      x: visibleLeft * dpr,
      y: visibleTop * dpr,
      width: visibleWidth * dpr,
      height: visibleHeight * dpr,
      // 原始尺寸（用于计算）
      raw: {
        left: visibleLeft,
        top: visibleTop,
        width: visibleWidth,
        height: visibleHeight
      }
    };
  }

  /**
   * 平滑滚动到指定位置
   */
  async scrollTo(element, scrollTop) {
    return new Promise(resolve => {
      element.scrollTop = scrollTop;

      // 等待滚动完成和渲染稳定
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // 额外等待一小段时间，确保渲染完成
          setTimeout(resolve, 50);
        });
      });
    });
  }

  /**
   * 显示进度指示器
   */
  showProgress(current, total, status = '正在截图...') {
    if (!this.progressIndicator) {
      this.progressIndicator = document.createElement('div');
      this.progressIndicator.className = 'esc-progress-indicator';
      document.body.appendChild(this.progressIndicator);
    }

    const progress = Math.round((current / total) * 100);

    this.progressIndicator.innerHTML = `
      <div class="title">${status}</div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${progress}%"></div>
      </div>
      <div class="status">${current} / ${total}</div>
    `;
  }

  /**
   * 隐藏进度指示器
   */
  hideProgress() {
    if (this.progressIndicator) {
      this.progressIndicator.remove();
      this.progressIndicator = null;
    }
  }

  /**
   * 隐藏滚动条（截图时）
   */
  hideScrollbars(element) {
    const originalStyle = element.getAttribute('style') || '';
    const originalOverflow = getComputedStyle(element).overflow;

    // 添加隐藏滚动条的样式
    element.style.scrollbarWidth = 'none'; // Firefox
    element.style.msOverflowStyle = 'none'; // IE/Edge

    // 对于 WebKit 浏览器，需要添加伪元素样式
    const styleId = 'esc-hide-scrollbar-style';
    let styleEl = document.getElementById(styleId);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      styleEl.textContent = `
        [data-esc-hide-scrollbar]::-webkit-scrollbar {
          display: none !important;
          width: 0 !important;
          height: 0 !important;
        }
      `;
      document.head.appendChild(styleEl);
    }

    element.setAttribute('data-esc-hide-scrollbar', 'true');

    return {
      restore: () => {
        element.setAttribute('style', originalStyle);
        element.removeAttribute('data-esc-hide-scrollbar');
      }
    };
  }

  /**
   * 执行滚动截图
   * @param {Element} element - 目标元素
   * @param {Function} onProgress - 进度回调
   * @returns {Promise<Array>} - 帧数据数组
   */
  async captureFrames(element, onProgress) {
    const frameInfo = this.calculateFrames(element);
    const frames = [];

    console.log('[ESC] Frame calculation:', frameInfo);

    // 隐藏滚动条
    const scrollbarState = this.hideScrollbars(element);

    try {
      // 滚动到顶部
      await this.scrollTo(element, 0);

      for (let i = 0; i < frameInfo.totalFrames; i++) {
        // 计算当前滚动位置
        const scrollTop = i === 0 ? 0 :
          Math.min(i * frameInfo.frameHeight, frameInfo.scrollableHeight);

        // 滚动到位置
        await this.scrollTo(element, scrollTop);

        // 更新进度
        this.showProgress(i + 1, frameInfo.totalFrames);
        if (onProgress) {
          onProgress(i + 1, frameInfo.totalFrames);
        }

        // 隐藏进度指示器以便截图
        this.hideProgress();

        // 额外等待，确保渲染稳定
        await new Promise(resolve => setTimeout(resolve, 100));

        // 请求截图
        const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_FRAME' });

        if (!response.success) {
          throw new Error(response.error || 'Failed to capture frame');
        }

        // 计算裁剪区域
        const cropRegion = this.calculateCropRegion(element);

        frames.push({
          dataUrl: response.dataUrl,
          cropRegion,
          scrollTop,
          frameIndex: i
        });

        console.log(`[ESC] Captured frame ${i + 1}/${frameInfo.totalFrames}`, cropRegion.raw);
      }

      // 恢复原始滚动位置
      await this.scrollTo(element, frameInfo.initialScrollTop);

    } finally {
      // 恢复滚动条
      scrollbarState.restore();
      this.hideProgress();
    }

    return frames;
  }

  /**
   * 执行完整的截图流程
   * @param {Element} element - 目标元素
   * @param {Isolator} isolator - 隔离器实例
   * @param {Function} onProgress - 进度回调
   */
  async capture(element, isolator, onProgress) {
    try {
      // 1. 隔离干扰元素
      const isolatedCount = isolator.isolate(element);
      console.log(`[ESC] Isolated ${isolatedCount} elements`);

      // 等待隔离生效
      await new Promise(resolve => setTimeout(resolve, 100));

      // 2. 执行滚动截图
      const frames = await this.captureFrames(element, onProgress);

      // 3. 恢复隔离的元素
      isolator.restore();

      // 4. 发送拼接请求
      this.showProgress(frames.length, frames.length, '正在拼接...');

      // 通知 popup
      chrome.runtime.sendMessage({ type: 'STITCHING' });

      await chrome.runtime.sendMessage({
        type: 'STITCH_AND_DOWNLOAD',
        frames: frames,
        options: {
          detectDuplicates: true,
          maxOverlapHeight: Math.round(element.clientHeight * 0.3)
        }
      });

      this.hideProgress();

    } catch (error) {
      // 确保恢复隔离的元素
      isolator.forceRestore();
      this.hideProgress();
      throw error;
    }
  }
}

// 导出
window.ESCScroller = Scroller;
