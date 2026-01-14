# Privacy Policy for Element Screen Capture

**Last Updated: January 14, 2025**

## Overview

Element Screen Capture is a Chrome browser extension that helps users capture scrollable elements on web pages as long screenshots. We are committed to protecting your privacy and being transparent about our practices.

## Data Collection

**We do not collect, store, or transmit any user data.**

Specifically, this extension:

- ❌ Does NOT collect personal information
- ❌ Does NOT collect browsing history
- ❌ Does NOT collect website content
- ❌ Does NOT use cookies or tracking technologies
- ❌ Does NOT send any data to external servers
- ❌ Does NOT use analytics or telemetry

## How the Extension Works

All operations are performed **locally** on your device:

1. **Screenshot Capture**: Uses Chrome's native `captureVisibleTab` API to capture the visible area of your current tab. These captures are processed entirely in your browser's memory.

2. **Image Processing**: Screenshot stitching and cropping are performed locally using OffscreenCanvas. No images are uploaded anywhere.

3. **File Download**: The final screenshot is saved directly to your local Downloads folder through Chrome's download API.

## Permissions Explained

The extension requires the following permissions, used solely for its core functionality:

| Permission | Purpose |
|------------|---------|
| `activeTab` | Access the current tab to capture screenshots |
| `scripting` | Inject content scripts for element selection |
| `downloads` | Save the captured screenshot to your device |
| `<all_urls>` | Enable the extension to work on any website |

## Data Storage

This extension does not store any data. No local storage, cookies, or external databases are used.

## Third-Party Services

This extension does not integrate with or send data to any third-party services.

## Children's Privacy

This extension does not knowingly collect any information from children under 13 years of age.

## Changes to This Policy

If we make changes to this privacy policy, we will update the "Last Updated" date at the top of this page.

## Contact

If you have any questions about this privacy policy, please contact us:

- GitHub: [https://github.com/makecoderai/element-screen-capture](https://github.com/makecoderai/element-screen-capture)
- Website: [https://makecoder.com](https://makecoder.com)

## Open Source

This extension is open source. You can review the complete source code at:
[https://github.com/makecoderai/element-screen-capture](https://github.com/makecoderai/element-screen-capture)
