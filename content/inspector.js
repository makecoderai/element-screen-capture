/**
 * 元素拾取模块 (Inspector)
 * 负责元素选择、高亮显示、滚动容器识别
 */

class Inspector {
  constructor() {
    this.active = false;
    this.highlightEl = null;
    this.sizeLabel = null;
    this.tooltip = null;
    this.currentElement = null;
    this.altPressed = false;

    // 绑定事件处理器
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
  }

  /**
   * 开始选择模式
   * @param {Function} onSelect - 选择完成回调
   * @param {Function} onCancel - 取消回调
   */
  start(onSelect, onCancel) {
    if (this.active) return;

    this.active = true;
    this.onSelect = onSelect;
    this.onCancel = onCancel;

    this.createOverlayElements();
    this.attachEventListeners();
    this.showTooltip();
  }

  /**
   * 停止选择模式
   */
  stop() {
    if (!this.active) return;

    this.active = false;
    this.removeOverlayElements();
    this.detachEventListeners();
    this.currentElement = null;
  }

  /**
   * 创建覆盖层元素
   */
  createOverlayElements() {
    // 高亮框
    this.highlightEl = document.createElement('div');
    this.highlightEl.className = 'esc-highlight-overlay';
    document.body.appendChild(this.highlightEl);

    // 尺寸标签
    this.sizeLabel = document.createElement('div');
    this.sizeLabel.className = 'esc-size-label';
    document.body.appendChild(this.sizeLabel);
  }

  /**
   * 显示提示浮层
   */
  showTooltip() {
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'esc-tooltip';
    this.tooltip.innerHTML = `
      移动鼠标选择元素 | 按住 <kbd>Alt</kbd> 选择父级滚动容器 | <kbd>Esc</kbd> 取消
    `;
    document.body.appendChild(this.tooltip);

    // 5秒后自动隐藏
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

  /**
   * 移除覆盖层元素
   */
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

  /**
   * 添加事件监听
   */
  attachEventListeners() {
    document.addEventListener('mousemove', this.handleMouseMove, true);
    document.addEventListener('click', this.handleClick, true);
    document.addEventListener('keydown', this.handleKeyDown, true);
    document.addEventListener('keyup', this.handleKeyUp, true);
    window.addEventListener('scroll', this.handleScroll, true);
  }

  /**
   * 移除事件监听
   */
  detachEventListeners() {
    document.removeEventListener('mousemove', this.handleMouseMove, true);
    document.removeEventListener('click', this.handleClick, true);
    document.removeEventListener('keydown', this.handleKeyDown, true);
    document.removeEventListener('keyup', this.handleKeyUp, true);
    window.removeEventListener('scroll', this.handleScroll, true);
  }

  /**
   * 判断元素是否为滚动容器
   */
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

  /**
   * 查找最近的滚动容器祖先
   */
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

  /**
   * 获取目标元素（考虑 Alt 键）
   */
  getTargetElement(element) {
    if (!element) return null;

    // 跳过我们自己创建的元素
    if (element.classList.contains('esc-highlight-overlay') ||
        element.classList.contains('esc-size-label') ||
        element.classList.contains('esc-tooltip')) {
      return null;
    }

    // 如果按住 Alt，尝试选择父级滚动容器
    if (this.altPressed) {
      const scrollableParent = this.findScrollableParent(element);
      if (scrollableParent) {
        return scrollableParent;
      }
    }

    return element;
  }

  /**
   * 更新高亮显示
   */
  updateHighlight(element) {
    if (!element || !this.highlightEl || !this.sizeLabel) return;

    const rect = element.getBoundingClientRect();
    const isScrollable = this.isScrollable(element);

    // 更新高亮框位置
    this.highlightEl.style.left = `${rect.left}px`;
    this.highlightEl.style.top = `${rect.top}px`;
    this.highlightEl.style.width = `${rect.width}px`;
    this.highlightEl.style.height = `${rect.height}px`;

    // 更新滚动容器样式
    if (isScrollable) {
      this.highlightEl.classList.add('scrollable');
      this.sizeLabel.classList.add('scrollable');
    } else {
      this.highlightEl.classList.remove('scrollable');
      this.sizeLabel.classList.remove('scrollable');
    }

    // 更新尺寸标签
    let sizeText = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;

    if (isScrollable) {
      const scrollHeight = element.scrollHeight;
      const scrollWidth = element.scrollWidth;
      if (scrollHeight > rect.height || scrollWidth > rect.width) {
        sizeText += `<span class="scroll-info">滚动: ${Math.round(scrollWidth)} × ${Math.round(scrollHeight)}</span>`;
      }
    }

    this.sizeLabel.innerHTML = sizeText;

    // 定位尺寸标签（在元素上方或下方）
    const labelHeight = 24;
    const margin = 8;

    if (rect.top > labelHeight + margin) {
      this.sizeLabel.style.top = `${rect.top - labelHeight - margin}px`;
    } else {
      this.sizeLabel.style.top = `${rect.bottom + margin}px`;
    }

    this.sizeLabel.style.left = `${rect.left}px`;
  }

  /**
   * 鼠标移动处理
   */
  handleMouseMove(event) {
    if (!this.active) return;

    const element = document.elementFromPoint(event.clientX, event.clientY);
    const target = this.getTargetElement(element);

    if (target && target !== this.currentElement) {
      this.currentElement = target;
      this.updateHighlight(target);
    }
  }

  /**
   * 点击处理
   */
  handleClick(event) {
    if (!this.active) return;

    event.preventDefault();
    event.stopPropagation();

    if (this.currentElement) {
      this.stop();
      if (this.onSelect) {
        this.onSelect(this.currentElement);
      }
    }
  }

  /**
   * 键盘按下处理
   */
  handleKeyDown(event) {
    if (!this.active) return;

    if (event.key === 'Alt') {
      this.altPressed = true;
      // 重新计算当前元素（可能需要切换到滚动容器）
      const element = document.elementFromPoint(
        window.lastMouseX || 0,
        window.lastMouseY || 0
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

  /**
   * 键盘释放处理
   */
  handleKeyUp(event) {
    if (!this.active) return;

    if (event.key === 'Alt') {
      this.altPressed = false;
    }
  }

  /**
   * 滚动处理（更新高亮位置）
   */
  handleScroll() {
    if (!this.active || !this.currentElement) return;

    // 使用 requestAnimationFrame 优化性能
    requestAnimationFrame(() => {
      this.updateHighlight(this.currentElement);
    });
  }
}

// 跟踪鼠标位置（用于 Alt 键切换时重新计算）
document.addEventListener('mousemove', (e) => {
  window.lastMouseX = e.clientX;
  window.lastMouseY = e.clientY;
}, true);

// 导出
window.ESCInspector = Inspector;
