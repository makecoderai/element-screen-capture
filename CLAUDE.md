# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Element Screen Capture is a Chrome MV3 extension for capturing scrollable web page elements as long screenshots. It uses Chrome's native `captureVisibleTab` API (not html2canvas) for high-quality captures.

## Development Setup

No build step required. Load directly in Chrome:
1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the project directory

After code changes, click the refresh icon on the extension card in `chrome://extensions/`.

## Architecture

### Communication Flow
```
Popup (popup.js)
    ↓ START_INSPECTOR
Content Script (content.js)
    ↓ CAPTURE_FRAME (per scroll position)
Background Service Worker (background.js)
    ↓ captureVisibleTab → returns dataUrl
Content Script
    ↓ STITCH_AND_DOWNLOAD (all frames)
Background Service Worker
    → OffscreenCanvas stitching → chrome.downloads
```

### Core Classes in content.js

- **Inspector**: Element picker with hover highlighting. Detects scrollable containers (`overflow: auto/scroll`). Hold Alt to select parent scroll container.

- **Isolator**: Hides `position: fixed/sticky` elements that would overlap the capture area. Records original styles and restores after capture.

- **Scroller**: Controls scroll position, calculates frame count based on `scrollHeight`, captures frames with retry logic for Chrome's rate limiting (`MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND`).

### background.js Functions

- `captureVisibleTab()`: Wraps Chrome API for screenshot capture
- `stitchFrames()`: Uses OffscreenCanvas to combine frames, with `detectOverlap()` to remove duplicate rows from sticky headers
- `blobToDataUrl()`: Converts blob to base64 (Service Workers don't have `URL.createObjectURL`)

## Key Implementation Details

- **Rate Limiting**: Chrome limits `captureVisibleTab` calls. The code uses 350ms delays between captures and retries on quota errors.

- **Crop Region**: Each frame stores a `cropRegion` (with devicePixelRatio scaling) to extract just the target element from the full viewport capture.

- **Scroll Container Detection**: `isScrollable()` checks both `overflow` CSS and actual `scrollHeight > clientHeight`.

- **Element Offset Calculation**: `getElementOffsetInContainer()` walks up `offsetParent` chain to find element position within scroll container.
