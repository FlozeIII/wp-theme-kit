# wp-theme-kit

[English](README.md) | 简体中文

一套跨 harness 的 WordPress 主题开发工具：一份共享技能包 + 一个零依赖 Node
CLI，可在 Claude Code、Codex、DeepSeek Harness 或普通终端里使用。

```bash
wptk check       # 离线检查结构、PHP、区块、i18n 与资源
wptk init        # classic、block 或 hybrid 主题脚手架
wptk shot        # 真实视口截图与视觉守卫
wptk package     # 从已提交的 Git 快照生成可复现 zip
wptk pot         # 生成翻译模板
```

## 为什么

主题开发在每个项目上都会重复同样的脆弱步骤：检查转义与文本域、核对模板部件、
打包时排除开发文件、截一张真实截图、保持 POT 最新。这套工具把这些步骤收进一个
CLI 和一套技能，因此用哪个 harness 都一样，结果可复现。

它提取自一个已在使用的 classic 主题，那套流程本来就使用零依赖 Node 脚本、
`git archive` 打包和 CDP 截图。开发时以 yuki 主题做 dogfood，但核心代码里没有
yuki 专用的选择器、文本域或环境变量。

## 环境要求

- Node.js 22.2 或更新版本。
- Git，用于打包和 `check --diff`。
- 可选：PHP 7.4 或更新版本，用于更深入的 `token_get_all` 分析器。
- 可选：Chromium 系浏览器（Edge 或 Chrome），用于截图。
- 可选：本地运行中的 WordPress 站点，用于 preview 与 audit。

不需要 `npm install`，不需要 Composer，也不依赖 WP-CLI。

## 安装

### CLI

```bash
npm install --global wp-theme-kit
wptk --help
```

不全局安装时，用 `npx wp-theme-kit <command>` 运行。

从源码检出：

```bash
git clone https://github.com/FlozeIII/wp-theme-kit.git
cd wp-theme-kit
npm link
```

此时 `wptk` 已在 PATH 上。若不想 `npm link`，可以运行
`node <kit>/bin/wp-theme-kit.mjs <command>`。

### Claude Code

原生插件：

```text
/plugin marketplace add FlozeIII/wp-theme-kit
/plugin install wp-theme-kit@wp-theme-kit
```

本地检出时，把该目录的绝对路径传给 `/plugin marketplace add`。

也可以只在单次会话中加载：

```bash
claude --plugin-dir <wp-theme-kit 的绝对路径>
```

### Codex

```bash
codex plugin marketplace add FlozeIII/wp-theme-kit
codex plugin add wp-theme-kit@wp-theme-kit
```

即使插件没有安装，Codex 也会把 `AGENTS.md` 作为兜底读取。

### DeepSeek Harness

DeepSeek 从 `.agents/skills` 发现技能，并读取 `AGENTS.md`。可以把它们装进主题项目，
或装进用户级目录：

```bash
node install.mjs --harness deepseek --project <主题目录>
node install.mjs --harness deepseek --global
```

`install.mjs` 在 Windows 上创建目录 junction（失败时回退为复制），写入安装清单，
并支持 `--uninstall`。默认使用链接；无法创建链接时改为复制，`--copy` 则强制复制。

### 三端项目级安装

```bash
wptk install --harness all --project <主题目录>
```

它把技能链接到 `.claude/skills`、`.agents/skills` 与 `.codex/skills`，把 Claude
命令复制到 `.claude/commands/wp-theme-kit`，并写入 AGENTS.md 块。

## 快速开始

```bash
# 检查环境与当前主题
wptk doctor

# 检查当前主题
wptk check
wptk check --format json --fail-on warning
wptk check --diff HEAD
wptk check --explain php.unescaped-output
wptk check --fix --dry-run
wptk check --fix

# 新建主题
wptk init my-theme --type block --name "My Theme"
cd my-theme
wptk check
wptk shot --url http://localhost:8080

# 添加代码
wptk make module related-posts
wptk make block callout

# 翻译
wptk pot
wptk pot --check

# 发布
wptk version bump patch
wptk package --rev v0.2.0
wptk verify-package dist/my-theme.zip
```

## 命令

| 命令 | 用途 |
|---|---|
| `wptk doctor` | 报告 Node、Git、PHP、WordPress、WP-CLI、浏览器与主题元数据。 |
| `wptk init <slug>` | 创建 classic、block 或 hybrid 主题。 |
| `wptk adopt [dir]` | 给已有主题补配置与 agent 指令。 |
| `wptk check [dir]` | 运行离线检查。`--format json` 或 `github`、`--baseline`、`--fail-on`、`--diff <ref>`、`--fix [--dry-run]`；`--explain <rule-id>` 读取规则文档。 |
| `wptk make template|part|module|block|pattern <name>` | 生成聚焦的单文件。 |
| `wptk pot [--out file]` | 生成 POT；`--merge` 保留头部元数据；`--check` 比对 msgid 集合。 |
| `wptk shot [route]` | 用真实视口截图；`--all`、`--dark`、`--full-page`；`--cookie-file` 截取登录后页面。 |
| `wptk compare <expected> <actual>` | 像素差异对比，支持 `--tolerance`、`--channel`；`--out` 写红/灰 diff PNG。 |
| `wptk audit [route]` | 控制台错误、失败资源、溢出、缺失选择器、重复 id、空链接、无标签表单控件；`--cookie-file` 截取登录后页面；`--baseline <file>` 与 `--update-baseline` 接受已知控制台/溢出问题。 |
| `wptk preview [route]` | 在系统浏览器中打开路由。 |
| `wptk version [bump patch|minor|major]` | 打印或更新 `style.css` 与 `package.json` 版本。 |
| `wptk package [out.zip] [--rev ref]` | 从已提交的 revision 构建。 |
| `wptk verify-package <zip>` | 不依赖 WordPress 检查产物。 |
| `wptk theme-check --zip <file>` | 对解包产物运行可选的本地 Theme Check。 |
| `wptk release [--rev ref]` | 本地预检、打包、验收与清单；`--notes [--since ref]` 草拟分组发布说明。 |
| `wptk install --harness ...` | 安装技能与 AGENTS.md 条目。 |
| `wptk mu-plugin <install\|status\|remove\|mail>` | 为本地 WordPress 提供可选的邮件捕获与 HTTP stub 助手；`--wp-root`、`--helper`、`--force`、`--limit`、`--clear`。 |

全局参数：`--cwd <dir>`、`--json`、`--no-color`、`--quiet`。
退出码：`0` 成功，`1` 检查或门禁失败，`2` 用法或环境错误。

## 配置

主题根目录下的 `.wp-theme-kit.json`：

```json
{
  "slug": "my-theme",
  "type": "classic",
  "textDomain": "my-theme",
  "prefix": "my_theme",
  "kit": { "path": "/path/to/wp-theme-kit" },
  "wordpress": {
    "path": "/path/to/wordpress",
    "php": "/path/to/php",
    "url": "http://localhost:8080"
  },
  "checks": {
    "failOn": "error",
    "analyzer": "auto",
    "ignore": ["vendor/**"],
    "rules": { "php.abspath-guard": "off" }
  },
  "package": {
    "subdir": null,
    "distignore": ".distignore",
    "output": "dist/{slug}.zip",
    "check": true,
    "checkPot": true
  },
  "preview": {
    "browser": null,
    "routes": [
      { "name": "home", "path": "/", "width": 1200, "height": 900, "waitFor": ".site-header", "expect": ["main"] }
    ],
    "guards": { "noHorizontalOverflow": true, "noConsoleErrors": true, "imagesLoaded": true, "accessibility": true }
  }
}
```

环境变量覆盖：`WPTK_WP_ROOT`、`WPTK_PHP`、`WPTK_SITE`、`WPTK_BROWSER`、
`WPTK_WP_CLI`、`WPTK_KIT`、`WPTK_DEBUG`、`WPTK_NO_COLOR`。

## 一套技能包如何服务三种 harness

```text
skills/<name>/SKILL.md        规范技能，三个 harness 共用同一份文件
.claude-plugin/plugin.json    Claude 插件清单
.claude-plugin/marketplace.json
.codex-plugin/plugin.json     Codex 插件清单，指向 ./skills/
.agents/plugins/marketplace.json
.commands/*.md                仅 Claude 使用的薄包装
AGENTS.md                     Codex 与 DeepSeek 的持久指令
```

SKILL.md 的 frontmatter 只使用三者都接受的键：`name`、`description`、`license`
与 `metadata`。`$ARGUMENTS`、`${CLAUDE_PLUGIN_ROOT}` 等 Claude 专用语法留在
`commands/` 中。DeepSeek 与 Codex 的旁挂文件位于 `skills/<name>/agents/openai.yaml`。

## 安全与限制

- 打包只读取已提交文件。未提交和未跟踪的改动永远不会进入产物。
- `.distignore` 只支持根目录相对的字面路径。通配符、取反、转义和路径穿越都会
  被拒绝并报出行号。
- 布局损坏时，视觉守卫拒绝覆盖已有截图。
- `wptk release` 从不 push、打标签或发布。
- `check` 是快速的离线门禁，不替代 Theme Check 或 PHPCS-WordPress。发布前请对
  解包产物运行这些工具。
- POT 提取器处理字面量 gettext 调用。动态字符串会被跳过并计数；请修正调用，
  不要手工编辑 POT。

## 审计基线

```bash
wptk audit --update-baseline
wptk audit --baseline .wp-theme-kit-audit-baseline.json --json
wptk audit --baseline review/known-browser-issues.json --update-baseline
```

基线必须显式使用：不加这些参数时，`audit` 不会自动发现基线。更新会审计所有已配置
路由，把当前启用的控制台/溢出问题原子写入，并在当次运行中应用。默认输出为主题根
目录下的 `.wp-theme-kit-audit-baseline.json`；显式路径相对 `--cwd` 解析。接受生成
的文件前先审阅。静态 `check` 的基线使用独立的格式与文件。新主题模板不会把默认
审计基线打进包；已有主题或自定义基线路径需要把其字面路径加入 `.distignore`。

version-1 JSON 对象包含 `findings` 数组。每条记录 `url`、`viewport`
（`width`、`height`）、`colorScheme`（`light` 或 `dark`）与 `kind`。
`console-error` 条目额外记录精确的 `message` 文本和正数 `count`；
`horizontal-overflow` 条目额外记录精确的 `scrollWidth`。匹配包含 URL 的
origin/query 与实际视口；多出的错误次数、变化的文本、新 profile 和变化的溢出宽度
仍然失败。重复的路由 profile 记录单次访问的最大次数，绝不累计多次访问。

JSON 保留全部观测事实，增加每路由的 `suppressed` 计数/溢出标记，以及顶层
`baseline` 对象（`path`、`updated` 和被抑制总数）。Pretty 输出在原始计数旁标注抑制。
HTTP 状态错误、HTTP/网络资源失败、未加载图片和缺失选择器仍然失败。被禁用的守卫
保持禁用，且不进入快照。基线从不影响 `shot` 及其对已有图片的保护。

读取永不重写基线。更新会替换过期条目，要求所有路由且守卫启用，并拒绝位置参数路由
或 `--no-guard`。读取文件缺失/无效、更新文件格式损坏时，在打开浏览器之前以 2 退出。
导航/启动失败会保留现有基线字节。无效 JSON/UTF-8、不支持的版本/kind、格式错误的
条目和重复身份都会被拒绝。失败时 audit 的 JSON stdout 仍可解析。

`audit --baseline` 只接受精确匹配的已知控制台错误和溢出，原始观测仍保留。
通过 `--update-baseline` 显式更新全部路由；资源、图片和选择器失败仍须修复。

## 无障碍断言

`wptk audit` 还会运行三条无需主观判断的 DOM 断言：

- **重复 id。** 按文档顺序检查每个 `[id]`；每个 id 一条发现，并附使用次数。空 id
  被忽略。
- **空链接。** `a[href]` 与 `area[href]` 若无法从 `aria-labelledby`、`aria-label`、
  可见文本、后代图片的 `alt`、后代 SVG 的 `title` 或 `title` 属性取得可访问名称，
  即视为空链接。`hidden` 或 `aria-hidden` 后代里的文本和图片不计入。
- **无标签表单控件。** `input`、`select`、`textarea` 若无法从 `aria-labelledby`、
  `aria-label`、关联 label 或 `title` 取得名称，即视为无标签。`placeholder`、
  `name` 与 `value` 永不计入。hidden、submit、button、reset 与 image 类型的 input
  会被跳过。

位于 `aria-hidden` 或 `hidden` 下的链接和控件整体跳过。这些断言与其他守卫使用相同
默认值：有发现即失败，CLI 会打印每条发现及路由 URL。它们不能加入基线，因为重复 id
或无名链接总是可以修复。

把 `preview.guards.accessibility` 设为 `false` 可继续报告观测但不失败；`--no-guard`
则对单次运行关闭所有 audit 门禁。JSON 为每个路由增加 `duplicateIds`、`emptyLinks`
与 `unlabeledControls`；Pretty 输出增加对应计数。这些是静态 DOM 启发式，不是 WCAG
审计：永远不能替代键盘、缩放和读屏检查。`shot` 不运行它们，因此截图行为不变。

## 截图对比

```bash
wptk shot --out dist/shots/home.png
wptk compare baseline/home.png dist/shots/home.png --tolerance 0.001 --channel 8
wptk compare baseline/home.png dist/shots/home.png --out dist/home.diff.png --json
```

`compare` 解码两张 PNG；当像素差异比例超过 `--tolerance`（0..1，默认 0），或单像素
差异超过 `--channel`（0..255，默认 0）时，以 1 退出。`--out` 写出 diff PNG：变化像素
为红色，未变化像素是向白色淡化的期望图。两张图尺寸必须一致；不一致以 1 退出并给出
`reason: "size-mismatch"`，且不写 diff。`--out` 不能指向输入图片。参数错误、文件不可读
和不支持的 PNG 以 2 退出。

对比完全离线、不启动浏览器，适合 CI：用 `shot` 截图，再与已提交的基线做 diff。仅支持
8 位、非隔行的灰度、RGB、灰度+alpha 与 RGBA PNG，最大 5000 万像素；Chromium 截图正好
使用该子集。调色板、16 位、隔行和 `tRNS` 透明度会被拒绝。JSON 报告 `changedPixels`、
`totalPixels`、`changedRatio`、`maxChannelDelta`、生效参数和 diff 路径。

## 编辑页截图与 cookie 夹具

`/wp-admin/post-new.php` 这类后台页面需要登录会话。把 cookie 放在版本控制之外的 JSON
夹具里，传给 `shot` 或 `audit`：

```json
{
  "cookies": [
    {
      "name": "wordpress_logged_in_abc123",
      "value": "user|...",
      "url": "http://localhost:8080"
    }
  ]
}
```

```bash
wptk shot /wp-admin/post-new.php --cookie-file .wp-theme-kit-cookies.json --out dist/editor.png
wptk audit /wp-admin/post-new.php --cookie-file .wp-theme-kit-cookies.json
```

`--cookie-file` 覆盖 `preview.cookieFile`，后者从主题根目录解析。每个 cookie 需要
`name`、`value`，以及 `url` 或 `domain` 之一；`path` 默认 `/`，`httpOnly` 默认
`true`，`secure` 默认 `false`，`sameSite` 默认 `Lax`。cookie 在每条路由首次请求前写入，
因此初始导航就已登录。值永远不会被打印；夹具无效时在启动浏览器前以 2 退出。请勿把
夹具提交进 Git，并在用完后轮换会话。

## Mu-plugin 助手

`wptk mu-plugin` 把两个可选 PHP 助手安装到本地 WordPress 站点的
`wp-content/mu-plugins/`。它们是开发期观测工具：绝不随主题发布，也不得装在生产环境。

```bash
wptk mu-plugin install --wp-root ../wordpress
wptk mu-plugin status --wp-root ../wordpress
wptk mu-plugin mail --limit 5 --wp-root ../wordpress
wptk mu-plugin mail --clear --wp-root ../wordpress
wptk mu-plugin remove --wp-root ../wordpress
```

| 文件 | 用途 |
| --- | --- |
| `wp-theme-kit-mail.php` | 把 `wp_mail()` 捕获为 `.eml` 文件与 `index.jsonl`，而不是发送。 |
| `wp-theme-kit-http-stub.php` | 用 JSON 夹具回放出站 HTTP 请求。 |

`--helper mail|http|all` 限制 `install` 与 `remove` 的范围。每个助手都带
`WP-Theme-Kit-Helper` 头与 `Version`，`wp-content/mu-plugins/.wp-theme-kit-harness.json`
记录安装内容。旧版助手会被升级；更新版本或未标记的文件会被拒绝，除非传入 `--force`，
因此手改或第三方文件绝不会被静默替换。已是最新、带标记但不在清单中的助手，会在下次
`install` 时被接管（adopt）。`remove` 在没有清单时以 1 退出，只删除标记与所记录助手
一致的文件；标记不符的文件会被报告并保留。

WordPress 根目录依次来自 `--wp-root`、`.wp-theme-kit.json` 中的 `wordpress.path`、
`WPTK_WP_ROOT`，或包含 `wp-load.php` 的祖先目录。`install` 只写入一次
`wp-content/wp-theme-kit-harness/wp-theme-kit-harness.json`；后续运行保留已有文件：

```json
{
  "version": 1,
  "enabled": { "mail": true, "http": true },
  "mailDir": "mail",
  "httpDir": "http",
  "http": { "strict": false, "hosts": [] }
}
```

`wptk mu-plugin mail` 按从新到旧列出捕获邮件，默认 50 条；`--limit n` 缩小列表，
`--clear` 删除被索引的 `.eml`、附件和 `index.jsonl`，但保留无关文件。所有内容都在
`wp-content/wp-theme-kit-harness/mail/` 下。若配置的 `mailDir`/`httpDir` 是绝对路径
或含 `..`，`mail` 会拒绝，`status` 会报告；此时助手保持禁用，而不是回退到其他目录。

把 HTTP 夹具作为 `*.json` 放进 `wp-content/wp-theme-kit-harness/http/`。它们按文件名
顺序求值，先匹配者生效：

```json
{
  "match": { "method": "GET", "url": "^https://api\\.example\\.com/v1/" },
  "status": 200,
  "headers": { "content-type": "application/json" },
  "json": { "ok": true }
}
```

`match.method` 是大写方法或 `*`；`match.url` 是对完整 URL 的正则。响应体必须由
`body`（文本）、`json`（编码后的 JSON）、`bodyFile`（相对文件，最大 5 MiB）或
`base64` 之一提供。`status` 默认 200，`delayMs` 默认 0；延迟上限 10000 ms，避免夹具
长时间阻塞请求。未匹配请求透传到网络；把 `http.strict` 设为 `true` 可改为返回
`wptk_no_fixture` 的 `WP_Error`，并用 `http.hosts` 限制被 stub 的主机。
`wptk mu-plugin status` 会报告无效夹具，但不打印文件内容。

当 `wp_get_environment_type()` 为 `production` 时，两个助手都保持不生效，除非
`wp_theme_kit_harness_enabled` 过滤器返回 true。它们只在
`wp-content/wp-theme-kit-harness/` 内写入，绝不投递捕获的邮件，也绝不打印 cookie 或
凭据值。

使用 `--json` 时，stdout 只承载一个 JSON 文档，错误走 stderr。键：`install` 返回
`root`、`helpers`、`changed[]` 与 `config{path,created}`；`status` 返回 `root`、
`installed[]{helper,file,version,state,reason?}`、
`dirs{muPlugins,harness,mail,http}`、`config{exists,path,error}` 与
`fixtures{total,valid,invalid}`；`remove` 返回 `root`、`helpers`、`changed[]`、
`config` 与 `installed[]`；`mail` 返回 `dir`、`total`、`count` 与 `messages[]`，
`--clear` 时返回 `{cleared}`。`changed[]` 条目带 `helper`、`file` 与 `action`
（`install`、`update`、`adopted`、`unchanged`、`removed`、`absent`、`skipped`）。

## POT 头部元数据

```bash
wptk pot --merge
wptk pot --merge --out languages/my-theme.pot
wptk pot --check
```

`--merge` 读取已有输出文件，保留其头部注释、译者/团队信息、修订日期、问题反馈地址和
自定义字段。空值保留；缺失字段使用正常默认值。`Project-Id-Version`、
`POT-Creation-Date`、`X-Generator`、`X-Domain` 和 `Content-Type` 由正常生成刷新。
输出为 UTF-8；设置 `SOURCE_DATE_EPOCH` 可获得可复现的创建时间。

所有消息条目、引用与空翻译都从当前源码重新生成。已删除的字符串和旧条目的注释/翻译
会被丢弃。这里合并的是头部元数据，而不是 PO 文件中的翻译。

输出文件不存在时按正常流程生成。已有文件必须是 UTF-8 且头部可解析；头部格式错误/
重复，或字段名重复（忽略大小写）时，在写入前以 2 退出。请修正头部，或用普通
`wptk pot` 替换它。支持带引号的续行、BOM/CRLF、折叠字段值，以及转义的引号、反斜杠、
制表符、换行和回车。逻辑 CRLF 头部行尾会规范化为 LF。其他转义会被拒绝。
`--merge` 与 `--check` 互斥；`--check` 保持只读。不使用 `--merge` 时，生成行为与
之前一致。

## 仓库子目录中的主题

把 `package.subdir` 设为主题相对 Git 仓库根目录的字面路径：

```json
{ "package": { "subdir": "themes/my-theme" } }
```

配置可放在仓库根或所选主题根。`package`、`release` 和 `verify-package` 随后从该主题
推断元数据。其他命令保持原有的上下文选择。检查、POT/版本文件、`.distignore` 路径和
默认输出都相对主题：此例的默认 ZIP 是 `themes/my-theme/dist/<slug>.zip`。显式输出
参数保持既有 CLI 解析方式。

ZIP 只包含 `<slug>/` 和选定的已提交子树。排除列表来自该主题内的同一 revision；
根目录/兄弟文件与未提交数据不会进入。属性隔离与原子写入仍然生效。Git 对象读取保持
离线。发布要求整个仓库干净。

使用正斜杠字面路径；Unicode 与空格可用。绝对路径、点段、glob/pathspec 语法和
符号链接/junction 目录别名会被拒绝。子树必须是所请求 commit 中的目录。
`package.subdir` 为 null/空时保持仅仓库根打包。子树归档需要支持 `archive --mtime`
的 Git，以获得稳定的 commit 时间戳。

## 对 ZIP 运行 Theme Check

```bash
wptk theme-check --zip dist/my-theme.zip --wp-root /path/to/wordpress
wptk theme-check --zip dist/my-theme.zip --json
```

这个可选助手使用已有的本地 WordPress core、PHP/WP-CLI，以及 Theme Check 插件的官方
CLI 适配器 `wp-content/plugins/theme-check/wp-cli/class-theme-check-cli.php`。
WordPress 发现顺序为 `--wp-root`、kit 配置中的 `wordpress.path`、`WPTK_WP_ROOT`，
或工作目录之上的安装。PHP 与 WP-CLI 使用与 `doctor` 相同的发现逻辑（包括 `WPTK_PHP`
与 `WPTK_WP_CLI`）。不会下载或安装任何东西。

助手校验 ZIP，并解包为 `<temporary-root>/wp-content/themes/<slug>/`。它用 WordPress
的主题/格式化库和官方 Theme Check 命令类调用 WP-CLI `eval-file --skip-wordpress`。
它使用静态选项与内存缓存，不加载站点配置、数据库、插件或主题 PHP。清理临时根之前会
移除 core/checker 目录链接，失败后也一样。WP-CLI 配置与缓存都是临时的。这是隔离的
静态检查，不是真实站点运行时测试；不会提供子主题的父主题文件。本地运行时验收使用
WordPress 7.1.3 与 Theme Check 20260901。

退出码：完成通过或显式工具跳过为 `0`，Theme Check 失败为 `1`，输入无效或工具/运行时
错误为 `2`。跳过会打印原因；JSON 用 `skipped: true` 与 `ok: null` 区分。完成的 JSON
报告包含 `skipped: false`、布尔 `ok`，以及检查器的 `findings` 行（含 `type` 与
`value`）。建议与警告沿用 Theme Check 自己的通过/失败策略。缺少工具不会掩盖损坏的
ZIP。归档必须是单一 slug 目录且含 `style.css`；路径穿越、Windows 设备/短名别名、
大小写冲突和文件/目录冲突会在解包前被拒绝。条目会落地为普通文件。

## 发布标签预检

`wptk release --rev <tag>` 要求标签提交等于仓库 `HEAD`。任意名称的轻量标签和附注标签
都算，包括完整的 `refs/tags/<name>` 与 `tags/<name>` 引用。不一致时在生成说明或打包
之前失败，并保留已有 ZIP。用 `git switch --detach <commit>` 检出报告的提交后重试；
已发布的标签应保持不可变。

短名有歧义时使用显式的 `refs/tags/<name>` 或 `refs/heads/<name>`。完整 ref 使用其确切
命名空间，ZIP 使用预检解析出的 commit。仅名字像版本的 branch 仍是 branch。SHA、
branch 与 commit 表达式 revision 保留历史发布行为；`wptk package` 也继续接受历史标签。
该门禁在 `--notes` 与 `package.subdir` 下同样生效，所有 Git 读取保持离线。

通过标签执行 `release` 时，标签提交必须等于当前 HEAD；不一致时保留原 ZIP。
可检出提示的提交后重试；历史产物仍可通过 `package --rev <tag>` 构建。

## 发布说明草稿

```bash
wptk release --notes
wptk release --rev v1.2.0 --notes --since v1.1.0 --json
```

`--notes` 在正常的本地发布输出中加入 Markdown 草稿。JSON 增加 `notes` 对象，包含
`from`（ref 与 commit，或 null）、`to`（被打包的 commit）、`subdir`、分组的 commit
记录与 `markdown`。草稿标题使用目标 commit 的 `style.css` 版本。不会写入单独的说明
文件，也不会打标签、push 或发布；清单会提示你审阅草稿。

默认起点是 `git describe --tags` 选出的最近可达标签，排除所有直接指向目标的标签。
附注标签与轻量标签都算。没有前置标签时包含全部历史。`--since` 选择显式祖先提交/标签，
且要求 `--notes`；区间排除该基点、包含目标。端点相同时生成明确的“无变化”草稿。
浅克隆或历史不可用时在替换 ZIP 前失败；Git 从不抓取缺失对象。历史读取忽略
replacement refs，与归档的原始 commit 对象一致；标签发现独立于 Git 的列/颜色显示配置。

非合并 commit 在每个分组内按从旧到新排列：

| 分组 | Commit 约定 |
|---|---|
| Breaking Changes | `type!:` / `type(scope)!:`，或以 `BREAKING CHANGE:` / `BREAKING-CHANGE:` 开头的正文行 |
| Added | `feat` |
| Fixed | `fix` |
| Changed | `perf`、`refactor`、`style` |
| Documentation | `docs` |
| Maintenance | `build`、`ci`、`chore`、`test`、`revert` |
| Other Changes | 其他 subject，完整保留 |

保留 scope 与破坏性变更详情的第一行。Git 文本中的 Markdown 与 HTML 会被转义。空分组
省略。对 `package.subdir`，commit 历史限制在该字面主题目录；自动标签选择仍是全仓库，
因此主题专用标签请用 `--since`。既有发布门禁与不带 `--notes` 的行为保持不变。

## 脚本 footer 参数类型

`php.script-footer` 检查 `wp_enqueue_script()` 的第五个参数。应使用 `true`/`false`，
或 WordPress 6.3+ 的选项数组，例如
`[ 'strategy' => 'defer', 'in_footer' => true ]`。`'false'` 这样的字符串在 WordPress
中为真值，仍会选择 footer。

已知的字符串/数字/null 第五参数会告警。对字面量的短/长数组，规则检查最终已知的
`in_footer` 条目；字符串/数字/null/数组值会告警。布尔值、省略参数、空数组和其他选项
都可接受。注释、括号、嵌套值和尾随逗号均可处理。

带嵌套同引号表达式的复杂字符串插值会被跳过。无法解析的表达式、命名参数、调用解包、
含未知键或解包的数组也会跳过，heredoc/nowdoc 与二进制字符串同样跳过。转义的数字/
Unicode 数组键视为无法解析。只检查全局 enqueue-script 调用；方法与类、带命名空间
限定的调用被排除，含 namespace/import 的文件需要显式的全局名称。被检查的 PHP 永不
执行。既有 severity、抑制、基线、diff 与修复后复检行为适用；规则不会替你选择 footer
值，也不会自动修复。既有的 JS 回退在 heredoc 结束标签同行还有后续语法时可能漏掉之后
的调用；这类文件请使用 PHP 分析器。

## printf 参数计数

`php.printf-arguments` 在字面量 PHP `printf()` 格式需要比调用提供的值更多时告警。
例如 `printf( '%s: %d', 'Posts' )` 需要第二个值。支持精确的单/双引号格式，以及所有
主题类型中 WordPress gettext 单数返回包装器里的源码字面量。

计数遵循 PHP：`%%` 不消耗值，重复的位置引用复用值，星号宽度/精度会消耗参数（包括
PHP 8+ 的位置星号）。支持标志、ASCII 填充、字面宽度/精度和标准转换。多余的值合法，
不会告警。

动态/拼接/插值格式、heredoc/nowdoc、双引号格式中的数字/Unicode 转义、二进制前缀
字符串、复数/未知包装器、命名参数和解包会被跳过。方法、构造器、属性和命名空间限定
名称被排除；含 namespace/import 的文件需要显式的全局函数与包装器名称。裸名/全局名
大小写不敏感。不支持的格式语法会被跳过，且不执行任何 PHP 源码。规则没有自动修复，
并保留既有的 severity、忽略、基线、diff 与修复后复检管线。

## 字面量数组模板参数

`php.template-part-missing` 识别 classic/hybrid 主题中从字面量数组解包的位置参数：

```php
get_template_part( ...[ 'template-parts/card', 'single' ] );
get_template_part( ...array( 'template-parts/card', 'single' ) );
get_template_part( 'template-parts/card', ...[ 'single', [ 'value' => $data ] ] );
```

它检查 `template-parts/card-single.php` 与通用回退 `template-parts/card.php`，仅当两者
都不存在时告警。空、`null` 或省略的名称只使用通用目标。支持多个字面量解包、注释、
尾随逗号，以及嵌套的第三数据参数。WordPress 只接受字符串 slug；直接把数组当 slug
传递不会定义候选模板列表。

展开的全局调用也接受 `\get_template_part`。slug/name 必须是精确的单/双引号静态字符串。
动态值、拼接、插值字符串、heredoc/nowdoc 路径、带键数组、嵌套数组解包、索引表达式、
未知展开来源、命名空间限定函数和对象/静态方法调用都会被保守跳过。不执行被检查的 PHP。
普通未展开调用与其他模板 API 保持既有行为；忽略、severity、基线、diff、修复复检和输出
格式使用既有规则管线。

## 区块标记平衡

`block.markup-balance` 对 `templates/` 与 `parts/` 下递归的 HTML 文件报告未闭合区块、
意外或嵌套错误的闭合分隔符，以及未终止的区块注释。它对所有主题类型运行，并使用真实的
文件与分隔符行号，包括 CRLF 源文件。

支持嵌套、同级和自闭合区块。`wp:group` 这样的裸 core 名匹配 `wp:core/group`；自定义
命名空间保持区分。普通注释和转义标记不影响嵌套。闭合与祖先匹配但嵌套错误时，检查器
丢弃该祖先及其打开的子节点以继续；未匹配的闭合保留既有打开节点。

规则覆盖、路径忽略、基线、diff 范围和 fail-on 阈值正常适用。HTML 注释可抑制发现，例如
在打开区块前写 `<!-- wptk-ignore-next-line block.markup-balance -->`。抑制不会跳过解析。
`--fix` 不改动区块标记，并在应用其他机械修复后报告剩余区块错误。

这里检查的是分隔符平衡；不校验 HTML、已注册区块类型或属性 JSON 语法。用
`wptk check --explain block.markup-balance` 阅读理由与示例。

## 区块属性 JSON

`block.attribute-json` 在所有主题类型中，对 `templates/` 与 `parts/` 下 HTML 里完整的
打开与自闭合区块注释报告无效 JSON。它与平衡规则共享分隔符扫描器，并指向打开注释的真实
文件与行号，包括多行属性和 CRLF 源。消息包含从 1 开始的开括号列号（UTF-16 码元），
使同一行上相同的无效区块仍是独立发现。

区块名之后的文本（不含末尾的自闭合斜杠）若不为空，必须是合法 JSON。缺失属性允许。
这是语法校验：接受合法 JSON 对象、数组、字符串、数字、布尔和 `null`，但不检查属性类型、
schema 或区块注册。

闭合注释被排除。未终止注释由 `block.markup-balance` 报告；完整分隔符但 JSON 无效时仍
参与平衡检查。两条规则可独立配置和抑制。既有忽略、基线、diff、格式和 fail-on 选项正常
适用。`--fix` 不重写属性，并在其他修复后保留这些错误。用
`wptk check --explain block.attribute-json` 查看示例。

## JSON 发现中的文档链接

检查报告 `findings` 数组的每条记录都含 `documentationUrl`，即指向已安装规则目录中该
解释的绝对 `file:` URL。例如 `php.unescaped-output` 链接到 kit 内的
`skills/wp-theme-dev/references/checks.md#php-unescaped-output`。显式锚点使用规则 ID
并把点替换为连字符；内部 `meta.rule-error` 诊断也有条目。

这些链接离线可用，指向产生该报告的安装，与主题或工作目录无关。路径会做 URL 编码，
包括空格和 Unicode。Markdown 查看器需支持显式 HTML 锚点才能跳转片段；
`wptk check --explain <rule-id>` 也能直接读取该条目。

该字段在 `--json` 与 `--format json` 中为增量字段，包括 `--diff`、修复预览和修复后
报告。计数、退出码、基线指纹和基线文件内容保持既有行为。Pretty 输出与 GitHub 注释
不包含链接元数据。

## 规则解释

运行 `wptk check --explain php.unescaped-output` 可查看规则理由与修改前后示例。当前
全部 42 条规则都在随包发布的
[规则目录](skills/wp-theme-dev/references/checks.md#rule-explanations)中有条目，该文件
也是 CLI 的解释来源。规则 ID 精确且区分大小写。

解释可离线在主题之外工作，不加载配置，也不发现 Git/PHP。可选的主题目录不会改变静态
条目。默认/`--format pretty` 输出为 Markdown；`--json` 或 `--format json` 返回
`{ "rule": "<id>", "documentation": "<Markdown 条目>" }`。

未知、空、重复或缺失 ID 以 2 退出。扫描选项（`--fix`、`--dry-run`、`--diff`、基线
参数、`--analyzer` 与 `--fail-on`）不能与解释组合。不支持的格式（包括 `github`）同样
以 2 退出。请另跑一次普通 `check` 检查主题。

## 变更文件检查

`wptk check --diff <ref>` 只报告一个已提交 Git ref 与当前工作区之间变更文件中的发现。
这包括已暂存和未暂存的修改，以及未忽略的未跟踪文件。commit hash、标签和 `HEAD~1`
这类 ref 都可用；无效 ref 或缺少 Git 时以 2 退出且不写文件。部分克隆中 Git 不会自动
抓取缺失对象；若比较需要不可用对象，命令以 2 退出且不应用修复。

主题可以位于更大的仓库中。路径相对主题，包含重命名目标，排除已删除文件。既有检查忽略、
行内抑制、基线、输出格式和失败阈值应用于范围内的发现。Windows 路径匹配能处理仅大小写
不同的重命名。

检查器仍会扫描整个主题以获取跨文件上下文。JSON 增加 `diff.ref` 与 `diff.files`（检查
范围内变更的源文件）；`summary.files` 仍是扫描源文件总数。没有具体文件的发现（显示为
`(theme)`）会被省略，包括全主题头部与 classic 标记发现。完整主题校验请用普通 `check`。

配合 `--fix [--dry-run]` 时，只有范围内的发现能产生修改，修复后报告保持同一 diff 范围。
`--diff --update-baseline` 会被拒绝，避免部分报告替换完整基线。

## 机械修复

先用 `wptk check --fix --dry-run` 预览，再用 `wptk check --fix` 应用。白名单包括：

- classic 与 hybrid 主题 `header.php` 中，唯一明确的打开 `<body>` 后缺少
  `wp_body_open()`。
- 恰好两个参数、且第一个参数为字面量的 gettext 调用缺少第三个文本域参数，例如
  `_x('Label', 'context')` 或 `_n_noop('One', 'Many')`。已有文本域和其他签名保持不变。
- `Tested up to` 头部包含一个带 `WP`、`WordPress` 或 `v` 前缀的数字版本，例如
  `WordPress v7.1` -> `7.1`。

修复遵守禁用规则、忽略路径、行内抑制与基线。有歧义的语法和符号链接文件会被跳过。文件
保留其 BOM 与行尾。应用修复后会再次检查；剩余发现决定退出码。Dry run 报告原始发现与
退出码，不写文件。`--dry-run` 需要 `--fix`；基线更新请另起一次调用。使用 `--json` 时，
`fixes.edits` 列出规则、文件、行号、替换文本，以及原文件中从 0 开始的 UTF-16
`start`/`end` 偏移（end 不含）。

## 开发

```bash
npm test                    # node --test
npm run test:unit
npm run test:integration
claude plugin validate . --strict
```

测试套件只使用 Node 内置模块。找不到浏览器时浏览器测试会跳过。仓库约定见 `AGENTS.md`。

## 许可证

MIT。按 WordPress 生态惯例，kit 生成的主题默认 GPL-2.0-or-later；用
`wptk init --license` 修改。



