---
name: wp-theme-preview
description: Preview and visually audit a WordPress theme in a real browser. Use for screenshots, screenshot.png generation, responsive width checks, console errors, failed assets, horizontal overflow, missing selectors, dark mode, or before declaring a visual change done.
license: MIT
metadata:
  author: FlozeIII
  version: "0.1.0"
---

# Preview and Audit a Theme

Screenshots are evidence, not decoration. Set the viewport before navigation,
wait for content, apply guards, and only then write the image.

## Commands

```bash
wptk doctor
wptk preview
wptk preview /about
wptk shot
wptk shot /about --out dist/about.png
wptk shot --all --out dist/shots
wptk shot --dark --width 375 --height 812
wptk audit
wptk audit /about --json
```

- The site URL comes from `--url`, `config.preview.baseUrl`,
  `config.wordpress.url`, or `WPTK_SITE`.
- `shot` defaults to `screenshot.png` in the theme root at 1200x900.
- `--all` captures every route in `config.preview.routes`.
- `audit` reports status, title, console errors, failed assets, horizontal
  overflow, unloaded images, and missing `expect` selectors.

## Route configuration

```json
{
  "preview": {
    "baseUrl": "http://localhost:8080",
    "routes": [
      { "name": "home", "path": "/", "width": 1200, "height": 900, "waitFor": ".site-header", "expect": ["main"] },
      { "name": "single", "path": "/?p=1", "width": 375, "height": 812 }
    ],
    "guards": { "noHorizontalOverflow": true, "noConsoleErrors": true, "imagesLoaded": true }
  }
}
```

## Guard failures

If a guard fails, the command exits nonzero and does not overwrite the existing
image. Fix the layout or the missing asset. Use `--no-guard` only to capture
diagnostic evidence, then re-run without it.

Common causes:

- horizontal overflow: a fixed width, an unbreakable long string, or a
  full-bleed element without `max-width: 100%`;
- unloaded image: a missing file or a lazy-load attribute that never resolves;
- console error: a missing script dependency or a JavaScript exception;
- missing selector: the route did not render the expected template.

## 中文摘要

截图必须在 `goto` 之前设好真实视口。`wptk shot` 默认产出 1200×900 的
`screenshot.png`，`--all` 按配置路由批量截图。`wptk audit` 检查状态码、控制台
错误、失败资源、横向溢出、未加载图片与缺失选择器。守护条件失败时不要覆盖旧图；
先用 `--no-guard` 只做诊断，修好后再正常跑。
