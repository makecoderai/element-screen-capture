/**
 * 干扰隔离模块 (Isolator)
 * 负责在截图时隐藏干扰元素（fixed/sticky 定位的遮挡层）
 */

class Isolator {
  constructor() {
    this.isolatedElements = [];
    this.isIsolated = false;
  }

  /**
   * 检查元素是否为固定定位（fixed 或 sticky）
   */
  isFixedOrSticky(element) {
    const style = getComputedStyle(element);
    return style.position === 'fixed' || style.position === 'sticky';
  }

  /**
   * 检查元素是否是目标元素的祖先
   */
  isAncestorOf(ancestor, target) {
    let current = target;
    while (current) {
      if (current === ancestor) return true;
      current = current.parentElement;
    }
    return false;
  }

  /**
   * 检查元素是否是目标元素的后代
   */
  isDescendantOf(descendant, target) {
    return target.contains(descendant);
  }

  /**
   * 检查两个矩形是否重叠
   */
  rectsOverlap(rect1, rect2) {
    return !(
      rect1.right < rect2.left ||
      rect1.left > rect2.right ||
      rect1.bottom < rect2.top ||
      rect1.top > rect2.bottom
    );
  }

  /**
   * 检查元素是否与目标元素在视觉上重叠
   */
  overlapsWithTarget(element, targetRect) {
    const rect = element.getBoundingClientRect();

    // 元素必须可见
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }

    // 元素必须有尺寸
    if (rect.width === 0 || rect.height === 0) {
      return false;
    }

    return this.rectsOverlap(rect, targetRect);
  }

  /**
   * 递归扫描 Shadow DOM
   */
  scanShadowDOM(root, results) {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT,
      null,
      false
    );

    let node = walker.nextNode();
    while (node) {
      if (this.isFixedOrSticky(node)) {
        results.push(node);
      }

      // 检查 Shadow DOM
      if (node.shadowRoot) {
        this.scanShadowDOM(node.shadowRoot, results);
      }

      node = walker.nextNode();
    }
  }

  /**
   * 查找所有需要隔离的元素
   */
  findElementsToIsolate(targetElement) {
    const targetRect = targetElement.getBoundingClientRect();
    const elementsToIsolate = [];

    // 收集所有 fixed/sticky 元素
    const fixedStickyElements = [];

    // 扫描主文档
    this.scanShadowDOM(document.body, fixedStickyElements);

    // 也直接查询 fixed 和 sticky 元素（更快）
    const fixedElements = document.querySelectorAll('*');
    fixedElements.forEach(el => {
      if (this.isFixedOrSticky(el) && !fixedStickyElements.includes(el)) {
        fixedStickyElements.push(el);
      }
    });

    // 筛选需要隔离的元素
    for (const element of fixedStickyElements) {
      // 跳过目标元素本身
      if (element === targetElement) continue;

      // 跳过目标元素的祖先（可能包含目标）
      if (this.isAncestorOf(element, targetElement)) continue;

      // 跳过目标元素的后代（sticky header 在目标内部）
      if (this.isDescendantOf(element, targetElement)) continue;

      // 跳过我们自己创建的元素
      if (element.classList.contains('esc-highlight-overlay') ||
          element.classList.contains('esc-size-label') ||
          element.classList.contains('esc-tooltip') ||
          element.classList.contains('esc-progress-indicator')) {
        continue;
      }

      // 检查是否与目标重叠
      if (this.overlapsWithTarget(element, targetRect)) {
        elementsToIsolate.push(element);
      }
    }

    // 额外处理：查找高 z-index 的遮挡层
    // 这些可能不是 fixed/sticky，但仍然会遮挡目标
    const highZIndexElements = this.findHighZIndexOverlays(targetElement, targetRect);
    for (const element of highZIndexElements) {
      if (!elementsToIsolate.includes(element)) {
        elementsToIsolate.push(element);
      }
    }

    return elementsToIsolate;
  }

  /**
   * 查找高 z-index 的遮挡层
   */
  findHighZIndexOverlays(targetElement, targetRect) {
    const overlays = [];
    const targetZIndex = this.getEffectiveZIndex(targetElement);

    // 查找可能的遮罩层（常见的 class 名称）
    const potentialOverlays = document.querySelectorAll(
      '[class*="modal"], [class*="overlay"], [class*="backdrop"], ' +
      '[class*="popup"], [class*="dialog"], [class*="toast"], ' +
      '[class*="notification"], [class*="dropdown"], [class*="menu"]'
    );

    potentialOverlays.forEach(element => {
      if (element === targetElement) return;
      if (this.isAncestorOf(element, targetElement)) return;
      if (this.isDescendantOf(element, targetElement)) return;

      const style = getComputedStyle(element);
      const zIndex = parseInt(style.zIndex, 10) || 0;

      // 只关心 z-index 较高且与目标重叠的元素
      if (zIndex > targetZIndex && this.overlapsWithTarget(element, targetRect)) {
        overlays.push(element);
      }
    });

    return overlays;
  }

  /**
   * 获取元素的有效 z-index
   */
  getEffectiveZIndex(element) {
    let current = element;
    let maxZIndex = 0;

    while (current && current !== document.body) {
      const style = getComputedStyle(current);
      const zIndex = parseInt(style.zIndex, 10);
      if (!isNaN(zIndex) && zIndex > maxZIndex) {
        maxZIndex = zIndex;
      }
      current = current.parentElement;
    }

    return maxZIndex;
  }

  /**
   * 隔离干扰元素（隐藏它们）
   */
  isolate(targetElement) {
    if (this.isIsolated) {
      console.warn('Already isolated, call restore() first');
      return;
    }

    const elementsToIsolate = this.findElementsToIsolate(targetElement);

    for (const element of elementsToIsolate) {
      // 记录原始样式
      const originalVisibility = element.style.visibility;
      const originalPointerEvents = element.style.pointerEvents;

      this.isolatedElements.push({
        element,
        originalVisibility,
        originalPointerEvents
      });

      // 隐藏元素（使用 visibility 保持布局）
      element.style.visibility = 'hidden';
      element.style.pointerEvents = 'none';
      element.setAttribute('data-esc-isolated', 'true');
    }

    this.isIsolated = true;

    console.log(`[ESC] Isolated ${elementsToIsolate.length} interfering elements`);

    return elementsToIsolate.length;
  }

  /**
   * 恢复被隔离的元素
   */
  restore() {
    if (!this.isIsolated) return;

    for (const { element, originalVisibility, originalPointerEvents } of this.isolatedElements) {
      try {
        // 恢复原始样式
        element.style.visibility = originalVisibility;
        element.style.pointerEvents = originalPointerEvents;
        element.removeAttribute('data-esc-isolated');
      } catch (e) {
        // 元素可能已被移除
        console.warn('[ESC] Failed to restore element:', e);
      }
    }

    this.isolatedElements = [];
    this.isIsolated = false;

    console.log('[ESC] Restored all isolated elements');
  }

  /**
   * 强制恢复（用于错误处理）
   */
  forceRestore() {
    // 查找所有被标记为隔离的元素
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

// 导出
window.ESCIsolator = Isolator;
