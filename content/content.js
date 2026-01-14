/**
 * Content Script 主入口
 * 整合所有模块，处理与 popup/background 的通信
 */

// 动态加载模块脚本
async function loadModule(src) {
  return new Promise((resolve, reject) => {
    // 检查是否已加载
    if (document.querySelector(`script[data-esc-module="${src}"]`)) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(src);
    script.setAttribute('data-esc-module', src);
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

// 由于 MV3 不支持动态 script 注入到页面上下文，我们直接在 content script 中定义模块

// ============ Inspector 模块 ============
class Inspector {
  constructor() {
    this.active = false;
    this.highlightEl = null;
    this.sizeLabel = null;
    this.tooltip = null;
    this.currentElement = null;
    this.altPressed = false;

    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
  }

  start(onSelect, onCancel) {
    if (this.active) return;

    this.active = true;
    this.onSelect = onSelect;
    this.onCancel = onCancel;

    this.createOverlayElements();
    this.attachEventListeners();
    this.showTooltip();
  }

  stop() {
    if (!this.active) return;

    this.active = false;
    this.removeOverlayElements();
    this.detachEventListeners();
    this.currentElement = null;
  }

  createOverlayElements() {
    this.highlightEl = document.createElement('div');
    this.highlightEl.className = 'esc-highlight-overlay';
    document.body.appendChild(this.highlightEl);

    this.sizeLabel = document.createElement('div');
    this.sizeLabel.className = 'esc-size-label';
    document.body.appendChild(this.sizeLabel);
  }

  showTooltip() {
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'esc-tooltip';
    this.tooltip.innerHTML = `
      移动鼠标选择元素 | 按住 <kbd>Alt</kbd> 选择父级滚动容器 | <kbd>Esc</kbd> 取消
    `;
    document.body.appendChild(this.tooltip);

    setTimeout(() => {
      if (this.tooltip && this.tooltip.parentNode) {
        this.tooltip.style.opacity = '0';
        this.tooltip.style.transition = 'opacity 0.3s';
        setTimeout(() => {
          if (this.tooltip && this.tooltip.parentNode) {
            this.tooltip.remove();
            this.tooltip = null;
          }
        }, 300);
      }
    }, 5000);
  }

  removeOverlayElements() {
    if (this.highlightEl) {
      this.highlightEl.remove();
      this.highlightEl = null;
    }
    if (this.sizeLabel) {
      this.sizeLabel.remove();
      this.sizeLabel = null;
    }
    if (this.tooltip) {
      this.tooltip.remove();
      this.tooltip = null;
    }
  }

  attachEventListeners() {
    document.addEventListener('mousemove', this.handleMouseMove, true);
    document.addEventListener('click', this.handleClick, true);
    document.addEventListener('keydown', this.handleKeyDown, true);
    document.addEventListener('keyup', this.handleKeyUp, true);
    window.addEventListener('scroll', this.handleScroll, true);
  }

  detachEventListeners() {
    document.removeEventListener('mousemove', this.handleMouseMove, true);
    document.removeEventListener('click', this.handleClick, true);
    document.removeEventListener('keydown', this.handleKeyDown, true);
    document.removeEventListener('keyup', this.handleKeyUp, true);
    window.removeEventListener('scroll', this.handleScroll, true);
  }

  isScrollable(element) {
    if (!element || element === document.body || element === document.documentElement) {
      return false;
    }

    const style = getComputedStyle(element);
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;

    const hasOverflow = overflowY === 'auto' || overflowY === 'scroll' ||
                        overflowX === 'auto' || overflowX === 'scroll';

    const canScrollVertically = element.scrollHeight > element.clientHeight;
    const canScrollHorizontally = element.scrollWidth > element.clientWidth;

    return hasOverflow && (canScrollVertically || canScrollHorizontally);
  }

  findScrollableParent(element) {
    let current = element;

    while (current && current !== document.body) {
      if (this.isScrollable(current)) {
        return current;
      }
      current = current.parentElement;
    }

    return null;
  }

  getTargetElement(element) {
    if (!element) return null;

    if (element.classList.contains('esc-highlight-overlay') ||
        element.classList.contains('esc-size-label') ||
        element.classList.contains('esc-tooltip')) {
      return null;
    }

    if (this.altPressed) {
      const scrollableParent = this.findScrollableParent(element);
      if (scrollableParent) {
        return scrollableParent;
      }
    }

    return element;
  }

  updateHighlight(element) {
    if (!element || !this.highlightEl || !this.sizeLabel) return;

    const rect = element.getBoundingClientRect();
    const isScrollable = this.isScrollable(element);

    this.highlightEl.style.left = `${rect.left}px`;
    this.highlightEl.style.top = `${rect.top}px`;
    this.highlightEl.style.width = `${rect.width}px`;
    this.highlightEl.style.height = `${rect.height}px`;

    if (isScrollable) {
      this.highlightEl.classList.add('scrollable');
      this.sizeLabel.classList.add('scrollable');
    } else {
      this.highlightEl.classList.remove('scrollable');
      this.sizeLabel.classList.remove('scrollable');
    }

    let sizeText = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;

    if (isScrollable) {
      const scrollHeight = element.scrollHeight;
      const scrollWidth = element.scrollWidth;
      if (scrollHeight > rect.height || scrollWidth > rect.width) {
        sizeText += `<span class="scroll-info"> 滚动: ${Math.round(scrollWidth)} × ${Math.round(scrollHeight)}</span>`;
      }
    }

    this.sizeLabel.innerHTML = sizeText;

    const labelHeight = 24;
    const margin = 8;

    if (rect.top > labelHeight + margin) {
      this.sizeLabel.style.top = `${rect.top - labelHeight - margin}px`;
    } else {
      this.sizeLabel.style.top = `${rect.bottom + margin}px`;
    }

    this.sizeLabel.style.left = `${rect.left}px`;
  }

  handleMouseMove(event) {
    if (!this.active) return;

    this.lastMouseX = event.clientX;
    this.lastMouseY = event.clientY;

    const element = document.elementFromPoint(event.clientX, event.clientY);
    const target = this.getTargetElement(element);

    if (target && target !== this.currentElement) {
      this.currentElement = target;
      this.updateHighlight(target);
    }
  }

  handleClick(event) {
    if (!this.active) return;

    event.preventDefault();
    event.stopPropagation();

    if (this.currentElement) {
      // 保存元素引用，因为 stop() 会清除 currentElement
      const selectedElement = this.currentElement;
      this.stop();
      if (this.onSelect) {
        this.onSelect(selectedElement);
      }
    }
  }

  handleKeyDown(event) {
    if (!this.active) return;

    if (event.key === 'Alt') {
      this.altPressed = true;
      const element = document.elementFromPoint(
        this.lastMouseX || 0,
        this.lastMouseY || 0
      );
      const target = this.getTargetElement(element);
      if (target) {
        this.currentElement = target;
        this.updateHighlight(target);
      }
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.stop();
      if (this.onCancel) {
        this.onCancel();
      }
    }
  }

  handleKeyUp(event) {
    if (!this.active) return;

    if (event.key === 'Alt') {
      this.altPressed = false;
    }
  }

  handleScroll() {
    if (!this.active || !this.currentElement) return;

    requestAnimationFrame(() => {
      this.updateHighlight(this.currentElement);
    });
  }
}

// ============ Isolator 模块 ============
class Isolator {
  constructor() {
    this.isolatedElements = [];
    this.isIsolated = false;
  }

  isFixedOrSticky(element) {
    const style = getComputedStyle(element);
    return style.position === 'fixed' || style.position === 'sticky';
  }

  isAncestorOf(ancestor, target) {
    let current = target;
    while (current) {
      if (current === ancestor) return true;
      current = current.parentElement;
    }
    return false;
  }

  isDescendantOf(descendant, target) {
    return target.contains(descendant);
  }

  rectsOverlap(rect1, rect2) {
    return !(
      rect1.right < rect2.left ||
      rect1.left > rect2.right ||
      rect1.bottom < rect2.top ||
      rect1.top > rect2.bottom
    );
  }

  overlapsWithTarget(element, targetRect) {
    if (!element || !element.getBoundingClientRect) return false;

    try {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);

      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }

      if (rect.width === 0 || rect.height === 0) {
        return false;
      }

      return this.rectsOverlap(rect, targetRect);
    } catch (e) {
      return false;
    }
  }

  findElementsToIsolate(targetElement) {
    if (!targetElement) {
      console.warn('[ESC] targetElement is null');
      return [];
    }

    const targetRect = targetElement.getBoundingClientRect();
    const elementsToIsolate = [];

    const allElements = document.querySelectorAll('*');

    allElements.forEach(element => {
      if (!element) return;
      try {
        if (!this.isFixedOrSticky(element)) return;

        if (element === targetElement) return;
        if (this.isAncestorOf(element, targetElement)) return;
        if (this.isDescendantOf(element, targetElement)) return;

        if (element.classList.contains('esc-highlight-overlay') ||
            element.classList.contains('esc-size-label') ||
            element.classList.contains('esc-tooltip') ||
            element.classList.contains('esc-progress-indicator')) {
          return;
        }

        if (this.overlapsWithTarget(element, targetRect)) {
          elementsToIsolate.push(element);
        }
      } catch (e) {
        // 忽略无法访问的元素
      }
    });

    return elementsToIsolate;
  }

  isolate(targetElement) {
    if (this.isIsolated) {
      console.warn('[ESC] Already isolated, call restore() first');
      return;
    }

    const elementsToIsolate = this.findElementsToIsolate(targetElement);

    for (const element of elementsToIsolate) {
      const originalVisibility = element.style.visibility;
      const originalPointerEvents = element.style.pointerEvents;

      this.isolatedElements.push({
        element,
        originalVisibility,
        originalPointerEvents
      });

      element.style.visibility = 'hidden';
      element.style.pointerEvents = 'none';
      element.setAttribute('data-esc-isolated', 'true');
    }

    this.isIsolated = true;

    console.log(`[ESC] Isolated ${elementsToIsolate.length} interfering elements`);

    return elementsToIsolate.length;
  }

  restore() {
    if (!this.isIsolated) return;

    for (const { element, originalVisibility, originalPointerEvents } of this.isolatedElements) {
      try {
        element.style.visibility = originalVisibility;
        element.style.pointerEvents = originalPointerEvents;
        element.removeAttribute('data-esc-isolated');
      } catch (e) {
        console.warn('[ESC] Failed to restore element:', e);
      }
    }

    this.isolatedElements = [];
    this.isIsolated = false;

    console.log('[ESC] Restored all isolated elements');
  }

  forceRestore() {
    const isolatedElements = document.querySelectorAll('[data-esc-isolated="true"]');

    isolatedElements.forEach(element => {
      element.style.visibility = '';
      element.style.pointerEvents = '';
      element.removeAttribute('data-esc-isolated');
    });

    this.isolatedElements = [];
    this.isIsolated = false;
  }
}

// ============ Scroller 模块 ============
class Scroller {
  constructor() {
    this.progressIndicator = null;
  }

  calculateFrames(element) {
    const clientHeight = element.clientHeight;
    const scrollHeight = element.scrollHeight;
    const scrollTop = element.scrollTop;

    const scrollableHeight = scrollHeight - clientHeight;

    if (scrollableHeight <= 0) {
      return {
        totalFrames: 1,
        frameHeight: clientHeight,
        scrollableHeight: 0,
        initialScrollTop: scrollTop
      };
    }

    const overlapRatio = 0.2;
    const effectiveHeight = clientHeight * (1 - overlapRatio);

    const totalFrames = Math.ceil(scrollableHeight / effectiveHeight) + 1;

    return {
      totalFrames,
      frameHeight: effectiveHeight,
      scrollableHeight,
      initialScrollTop: scrollTop,
      clientHeight
    };
  }

  calculateCropRegion(element) {
    const rect = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;

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
      raw: {
        left: visibleLeft,
        top: visibleTop,
        width: visibleWidth,
        height: visibleHeight
      }
    };
  }

  async scrollTo(element, scrollTop) {
    return new Promise(resolve => {
      element.scrollTop = scrollTop;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(resolve, 50);
        });
      });
    });
  }

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

  hideProgress() {
    if (this.progressIndicator) {
      this.progressIndicator.remove();
      this.progressIndicator = null;
    }
  }

  hideScrollbars(element) {
    const originalStyle = element.getAttribute('style') || '';

    element.style.scrollbarWidth = 'none';
    element.style.msOverflowStyle = 'none';

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

  async captureFrames(element, onProgress) {
    const frameInfo = this.calculateFrames(element);
    const frames = [];

    console.log('[ESC] Frame calculation:', frameInfo);

    const scrollbarState = this.hideScrollbars(element);

    try {
      await this.scrollTo(element, 0);

      for (let i = 0; i < frameInfo.totalFrames; i++) {
        const scrollTop = i === 0 ? 0 :
          Math.min(i * frameInfo.frameHeight, frameInfo.scrollableHeight);

        await this.scrollTo(element, scrollTop);

        if (onProgress) {
          onProgress(i + 1, frameInfo.totalFrames);
        }

        // 隐藏进度指示器进行截图
        this.hideProgress();

        await new Promise(resolve => setTimeout(resolve, 100));

        const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_FRAME' });

        if (!response.success) {
          throw new Error(response.error || 'Failed to capture frame');
        }

        const cropRegion = this.calculateCropRegion(element);

        frames.push({
          dataUrl: response.dataUrl,
          cropRegion,
          scrollTop,
          frameIndex: i
        });

        console.log(`[ESC] Captured frame ${i + 1}/${frameInfo.totalFrames}`, cropRegion.raw);

        // 重新显示进度
        this.showProgress(i + 1, frameInfo.totalFrames);
      }

      await this.scrollTo(element, frameInfo.initialScrollTop);

    } finally {
      scrollbarState.restore();
      this.hideProgress();
    }

    return frames;
  }

  /**
   * 截取单帧（不可滚动元素）
   * @param {Element} element - 目标元素
   */
  async captureSingleFrame(element) {
    // 等待渲染稳定
    await new Promise(resolve => setTimeout(resolve, 200));

    const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_FRAME' });

    if (!response.success) {
      throw new Error(response.error || 'Failed to capture frame');
    }

    const cropRegion = this.calculateCropRegion(element);

    console.log('[ESC] Captured single frame', cropRegion.raw);

    return [{
      dataUrl: response.dataUrl,
      cropRegion,
      scrollTop: 0,
      frameIndex: 0
    }];
  }

  /**
   * 计算元素在滚动容器中的位置
   */
  getElementOffsetInContainer(element, container) {
    let offset = 0;
    let current = element;

    while (current && current !== container) {
      offset += current.offsetTop;
      current = current.offsetParent;
    }

    return offset;
  }

  /**
   * 滚动截图并用目标元素裁剪
   * @param {Element} scrollContainer - 滚动容器（用于滚动）
   * @param {Element} cropTarget - 裁剪目标元素（用于确定裁剪区域）
   * @param {Function} onProgress - 进度回调
   */
  async captureWithScrollAndCrop(scrollContainer, cropTarget, onProgress) {
    const frames = [];

    // 计算目标元素在滚动容器中的位置和高度
    const targetOffsetTop = this.getElementOffsetInContainer(cropTarget, scrollContainer);
    const targetHeight = cropTarget.scrollHeight || cropTarget.offsetHeight;
    const containerVisibleHeight = scrollContainer.clientHeight;

    // 需要滚动的总距离（基于目标元素高度）
    const scrollableForTarget = Math.max(0, targetHeight - containerVisibleHeight);

    // 计算帧数（基于目标元素高度，不是整个滚动容器）
    const overlapRatio = 0.2;
    const effectiveHeight = containerVisibleHeight * (1 - overlapRatio);
    const totalFrames = scrollableForTarget > 0
      ? Math.ceil(scrollableForTarget / effectiveHeight) + 1
      : 1;

    const initialScrollTop = scrollContainer.scrollTop;

    console.log('[ESC] Target element offset:', targetOffsetTop);
    console.log('[ESC] Target element height:', targetHeight);
    console.log('[ESC] Container visible height:', containerVisibleHeight);
    console.log('[ESC] Scrollable for target:', scrollableForTarget);
    console.log('[ESC] Total frames:', totalFrames);

    const scrollbarState = this.hideScrollbars(scrollContainer);

    try {
      // 先滚动到目标元素的顶部
      await this.scrollTo(scrollContainer, targetOffsetTop);
      console.log('[ESC] Scrolled to target element top');

      for (let i = 0; i < totalFrames; i++) {
        // 相对于目标元素顶部的滚动位置
        const relativeScrollTop = i === 0 ? 0 : Math.min(i * effectiveHeight, scrollableForTarget);
        const absoluteScrollTop = targetOffsetTop + relativeScrollTop;

        await this.scrollTo(scrollContainer, absoluteScrollTop);

        if (onProgress) {
          onProgress(i + 1, totalFrames);
        }

        this.hideProgress();

        await new Promise(resolve => setTimeout(resolve, 350));

        let response;
        let retries = 3;
        while (retries > 0) {
          response = await chrome.runtime.sendMessage({ type: 'CAPTURE_FRAME' });
          if (response.success) break;
          if (response.error && response.error.includes('quota')) {
            console.log('[ESC] Rate limited, waiting...');
            await new Promise(resolve => setTimeout(resolve, 500));
            retries--;
          } else {
            throw new Error(response.error || 'Failed to capture frame');
          }
        }
        if (!response.success) {
          throw new Error(response.error || 'Failed to capture frame after retries');
        }

        // 裁剪目标元素在当前视口中的可见部分
        const cropRegion = this.calculateCropRegion(cropTarget);

        frames.push({
          dataUrl: response.dataUrl,
          cropRegion,
          scrollTop: relativeScrollTop,
          frameIndex: i
        });

        console.log(`[ESC] Captured frame ${i + 1}/${totalFrames}`, cropRegion.raw);

        this.showProgress(i + 1, totalFrames);
      }

      // 恢复原始滚动位置
      await this.scrollTo(scrollContainer, initialScrollTop);

    } finally {
      scrollbarState.restore();
      this.hideProgress();
    }

    return frames;
  }

  /**
   * 计算裁剪区域（使用目标元素的宽度，滚动容器的高度）
   */
  calculateCropRegionForTarget(scrollContainer, cropTarget) {
    const containerRect = scrollContainer.getBoundingClientRect();
    const targetRect = cropTarget.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;

    // 宽度使用目标元素，高度使用滚动容器的可见部分
    const left = Math.max(0, targetRect.left);
    const top = Math.max(0, containerRect.top);
    const right = Math.min(window.innerWidth, targetRect.right);
    const bottom = Math.min(viewportHeight, containerRect.bottom);

    const width = right - left;
    const height = bottom - top;

    return {
      x: left * dpr,
      y: top * dpr,
      width: width * dpr,
      height: height * dpr,
      raw: { left, top, width, height }
    };
  }

  /**
   * 截取可滚动元素（分离滚动容器和目标元素）- 旧方法保留
   * @param {Element} scrollContainer - 滚动容器
   * @param {Element} targetElement - 目标元素（用于裁剪）
   * @param {Function} onProgress - 进度回调
   */
  async captureScrollableElement(scrollContainer, targetElement, onProgress) {
    const frameInfo = this.calculateFrames(scrollContainer);
    const frames = [];

    console.log('[ESC] Frame calculation:', frameInfo);

    const scrollbarState = this.hideScrollbars(scrollContainer);

    try {
      // 记录目标元素相对于滚动容器的位置
      const containerRect = scrollContainer.getBoundingClientRect();

      await this.scrollTo(scrollContainer, 0);

      for (let i = 0; i < frameInfo.totalFrames; i++) {
        const scrollTop = i === 0 ? 0 :
          Math.min(i * frameInfo.frameHeight, frameInfo.scrollableHeight);

        await this.scrollTo(scrollContainer, scrollTop);

        if (onProgress) {
          onProgress(i + 1, frameInfo.totalFrames);
        }

        this.hideProgress();

        // 等待渲染稳定，避免触发 Chrome 的 API 频率限制
        await new Promise(resolve => setTimeout(resolve, 350));

        // 带重试的截图
        let response;
        let retries = 3;
        while (retries > 0) {
          response = await chrome.runtime.sendMessage({ type: 'CAPTURE_FRAME' });
          if (response.success) {
            break;
          }
          if (response.error && response.error.includes('quota')) {
            console.log('[ESC] Rate limited, waiting...');
            await new Promise(resolve => setTimeout(resolve, 500));
            retries--;
          } else {
            throw new Error(response.error || 'Failed to capture frame');
          }
        }

        if (!response.success) {
          throw new Error(response.error || 'Failed to capture frame after retries');
        }

        // 计算滚动容器在视口中的裁剪区域
        const cropRegion = this.calculateCropRegion(scrollContainer);

        frames.push({
          dataUrl: response.dataUrl,
          cropRegion,
          scrollTop,
          frameIndex: i
        });

        console.log(`[ESC] Captured frame ${i + 1}/${frameInfo.totalFrames}`, cropRegion.raw);

        this.showProgress(i + 1, frameInfo.totalFrames);
      }

      await this.scrollTo(scrollContainer, frameInfo.initialScrollTop);

    } finally {
      scrollbarState.restore();
      this.hideProgress();
    }

    return frames;
  }

  /**
   * 检查元素是否可滚动
   */
  isScrollable(element) {
    if (!element || element === document.body || element === document.documentElement) {
      return false;
    }
    const style = getComputedStyle(element);
    const overflowY = style.overflowY;
    const overflow = style.overflow;

    // 检查是否有滚动相关的 overflow 设置
    const hasOverflow = overflowY === 'auto' || overflowY === 'scroll' ||
                        overflow === 'auto' || overflow === 'scroll';

    // 检查是否实际可以滚动
    const canScroll = element.scrollHeight > element.clientHeight + 1; // +1 容差

    console.log('[ESC] isScrollable check:', element.tagName,
      'overflow:', overflow, 'overflowY:', overflowY,
      'scrollHeight:', element.scrollHeight, 'clientHeight:', element.clientHeight,
      'result:', hasOverflow && canScroll);

    return hasOverflow && canScroll;
  }

  /**
   * 查找最近的滚动容器
   */
  findScrollableParent(element) {
    let current = element.parentElement;
    while (current && current !== document.body) {
      if (this.isScrollable(current)) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  async capture(element, isolator, onProgress) {
    try {
      console.log('[ESC] Target element:', element.tagName, element.className);

      // 确定滚动容器和裁剪目标
      let scrollContainer = element;
      let cropTarget = element;

      if (this.isScrollable(element)) {
        console.log('[ESC] Element is scrollable, using it directly');
        scrollContainer = element;
        cropTarget = element;
      } else {
        // 查找父级滚动容器
        const scrollableParent = this.findScrollableParent(element);
        if (scrollableParent) {
          console.log('[ESC] Found scrollable parent:', scrollableParent.tagName, scrollableParent.className);
          scrollContainer = scrollableParent;
          // 裁剪区域仍然使用选中的元素（限制宽度）
          cropTarget = element;
        } else {
          console.log('[ESC] No scrollable parent found, capturing single frame');
        }
      }

      const isolatedCount = isolator.isolate(cropTarget);
      console.log(`[ESC] Isolated ${isolatedCount} elements`);

      await new Promise(resolve => setTimeout(resolve, 100));

      let frames;
      const scrollInfo = this.calculateFrames(scrollContainer);

      if (scrollInfo.scrollableHeight > 0) {
        // 有可滚动内容，执行滚动截图
        console.log('[ESC] Performing scroll capture, frames:', scrollInfo.totalFrames);
        frames = await this.captureWithScrollAndCrop(scrollContainer, cropTarget, onProgress);
      } else {
        // 没有可滚动内容，只截取单帧
        console.log('[ESC] No scrollable content, capturing single frame');
        frames = await this.captureSingleFrame(cropTarget);
      }

      isolator.restore();

      this.showProgress(frames.length, frames.length, '正在拼接...');

      console.log('[ESC] Sending STITCH_AND_DOWNLOAD with', frames.length, 'frames');
      chrome.runtime.sendMessage({ type: 'STITCHING' });

      const response = await chrome.runtime.sendMessage({
        type: 'STITCH_AND_DOWNLOAD',
        frames: frames,
        options: {
          detectDuplicates: true,
          maxOverlapHeight: Math.round(element.clientHeight * 0.3)
        }
      });
      console.log('[ESC] STITCH_AND_DOWNLOAD response:', response);

      this.hideProgress();

    } catch (error) {
      isolator.forceRestore();
      this.hideProgress();
      throw error;
    }
  }
}

// ============ 主控制器 ============
class ElementScreenCapture {
  constructor() {
    this.inspector = new Inspector();
    this.isolator = new Isolator();
    this.scroller = new Scroller();
    this.isCapturing = false;
  }

  startInspector() {
    this.inspector.start(
      (element) => this.handleElementSelected(element),
      () => this.handleInspectorCancelled()
    );
  }

  cancelInspector() {
    this.inspector.stop();
  }

  async handleElementSelected(element) {
    if (this.isCapturing) return;

    this.isCapturing = true;

    // 通知 popup
    chrome.runtime.sendMessage({ type: 'ELEMENT_SELECTED' });

    try {
      await this.scroller.capture(element, this.isolator, (current, total) => {
        chrome.runtime.sendMessage({
          type: 'CAPTURE_PROGRESS',
          current,
          total
        });
      });
    } catch (error) {
      console.error('[ESC] Capture failed:', error);
      chrome.runtime.sendMessage({
        type: 'CAPTURE_ERROR',
        error: error.message
      });
    } finally {
      this.isCapturing = false;
    }
  }

  handleInspectorCancelled() {
    chrome.runtime.sendMessage({ type: 'INSPECTOR_CANCELLED' });
  }
}

// ============ 初始化 ============
const esc = new ElementScreenCapture();

// 注入样式
function injectStyles() {
  if (document.getElementById('esc-styles')) return;

  const style = document.createElement('style');
  style.id = 'esc-styles';
  style.textContent = `
    .esc-highlight-overlay {
      position: fixed;
      pointer-events: none;
      z-index: 2147483646;
      border: 2px solid #4a90d9;
      background: rgba(74, 144, 217, 0.1);
      box-sizing: border-box;
      transition: all 0.1s ease-out;
    }

    .esc-highlight-overlay.scrollable {
      border-color: #52c41a;
      background: rgba(82, 196, 26, 0.1);
    }

    .esc-size-label {
      position: fixed;
      z-index: 2147483647;
      padding: 4px 8px;
      background: #333;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
      font-size: 11px;
      font-weight: 500;
      border-radius: 4px;
      white-space: nowrap;
      pointer-events: none;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }

    .esc-size-label.scrollable {
      background: #52c41a;
    }

    .esc-size-label .scroll-info {
      color: #ffd666;
      margin-left: 8px;
    }

    .esc-tooltip {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      padding: 12px 20px;
      background: rgba(0, 0, 0, 0.85);
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      pointer-events: none;
      animation: esc-fade-in 0.2s ease-out;
    }

    .esc-tooltip kbd {
      display: inline-block;
      padding: 2px 6px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 4px;
      font-family: inherit;
      font-size: 12px;
      margin: 0 2px;
    }

    @keyframes esc-fade-in {
      from {
        opacity: 0;
        transform: translateX(-50%) translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    }

    .esc-progress-indicator {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 2147483647;
      padding: 24px 32px;
      background: rgba(0, 0, 0, 0.9);
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 16px;
      text-align: center;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    }

    .esc-progress-indicator .title {
      margin-bottom: 12px;
      font-weight: 500;
    }

    .esc-progress-indicator .progress-bar {
      width: 200px;
      height: 6px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 3px;
      overflow: hidden;
      margin-bottom: 8px;
    }

    .esc-progress-indicator .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #4a90d9, #36cfc9);
      border-radius: 3px;
      transition: width 0.2s ease;
    }

    .esc-progress-indicator .status {
      font-size: 13px;
      color: rgba(255, 255, 255, 0.7);
    }

    [data-esc-isolated="true"] {
      visibility: hidden !important;
    }
  `;
  document.head.appendChild(style);
}

injectStyles();

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'PING':
      sendResponse({ pong: true });
      break;

    case 'START_INSPECTOR':
      esc.startInspector();
      sendResponse({ success: true });
      break;

    case 'CANCEL_INSPECTOR':
      esc.cancelInspector();
      sendResponse({ success: true });
      break;
  }

  return true;
});

console.log('[ESC] Element Screen Capture content script loaded');
