import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { parseArgs } from '../args.mjs';
import { loadContext } from '../config.mjs';
import { resolveBaseUrl, resolveRoute } from '../preview/capture.mjs';
import { findWordPressRoot } from '../env.mjs';
import { EnvError, UsageError } from '../errors.mjs';
import { linkInfo } from '../fs.mjs';
import {
  findLink,
  linkTarget,
  listLinks,
  mountDirectory,
  planLink,
  removeLinkEntry,
  resolveLinkTarget,
  unmountDirectory,
  upsertLink,
  validateLinkPath,
} from '../preview/link.mjs';

const USAGE = `Usage: wptk preview [route] [--url <url>]
       wptk preview --link <dir> [--link-path <path>] [--site <url>] [--no-open] [--json]
       wptk preview --link-status [--site <url>] [--json]
       wptk preview --link-remove <path> [--site <url>] [--json]

Open the configured route in the system default browser, or mount a local
directory under the WordPress site so a design comparison page can be viewed
through the real site, with its CSS and JS in place.

Options:
  --url <url>          Site base URL for the route form.
  --link <dir>         Mount a local directory under <WordPress root>/<path>.
  --link-path <path>   Site path for --link, [a-z0-9-] segments. Default: oil-ui.
  --link-status        List mounts created by wptk.
  --link-remove <path> Remove a mount created by wptk.
  --site <url>         Site base URL for the link forms.
  --no-open            Create the mount without opening a browser.
  -h, --help           Show this help.`;

function openUrl(url) {
  if (process.platform === 'win32') {
    return spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  }
  if (process.platform === 'darwin') {
    return spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
  return spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}

function siteUrl(context, explicit) {
  return resolveBaseUrl(context, explicit || context.config.preview.baseUrl);
}

function realPath(value) {
  try {
    return fs.realpathSync.native(value);
  } catch {
    return path.resolve(value);
  }
}

function wordpressRoot(context) {
  const root = findWordPressRoot({
    explicit: context.config.wordpress?.path,
    startDir: context.root,
  });
  if (!root) {
    throw new EnvError(
      'Cannot find a WordPress installation (wp-load.php).',
      'Set config.wordpress.path, WPTK_WP_ROOT, or run from inside the site.',
    );
  }
  if (!fs.existsSync(path.join(root, 'wp-content'))) {
    throw new EnvError(
      `${root} is not a WordPress site root (no wp-content directory).`,
      'Point config.wordpress.path or WPTK_WP_ROOT at the directory that contains wp-content.',
    );
  }
  return root;
}

/** One HEAD probe; 4xx still means the site answered, 5xx or no answer does not. */
async function responds(url) {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(3000),
    });
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  }
}

function insideWorkspace(workspace, dir) {
  const relative = path.relative(realPath(workspace), realPath(dir));
  return relative === ''
    || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function sourceDirectory(value, cwd) {
  if (!value) throw new UsageError('--link needs a directory.');
  const source = realPath(path.resolve(cwd, value));
  let stat = null;
  try {
    stat = fs.statSync(source);
  } catch {
    stat = null;
  }
  if (!stat || !stat.isDirectory()) throw new UsageError(`${value} is not a directory.`);
  return source;
}

async function link(context, globals, out, values) {
  const cwd = globals.cwd || process.cwd();
  const workspace = realPath(cwd);
  const source = sourceDirectory(values.link, cwd);
  if (!insideWorkspace(workspace, source)) {
    throw new UsageError(`Refusing to link outside the workspace: ${source}.`);
  }
  const linkPath = validateLinkPath(values['link-path']);
  const baseUrl = siteUrl(context, values.site);
  const url = linkTarget(baseUrl, linkPath);
  const wpRoot = wordpressRoot(context);
  const plan = planLink({ wpRoot, source, linkPath });

  if (plan.action === 'refuse') {
    if (plan.reason === 'inside-source') {
      throw new UsageError(`Refusing to mount ${plan.target}: it is inside the source directory.`);
    }
    if (plan.reason === 'copy') {
      throw new UsageError(
        `${plan.target} is a copied mount created by wptk.`,
        'wptk never deletes copied trees; delete it yourself, then run --link again.',
      );
    }
    throw new UsageError(
      `${plan.target} already exists and was not created by wptk.`,
      'Pass --link-path to mount somewhere else, or remove it yourself.',
    );
  }

  let kind = plan.registered?.kind ?? 'link';
  let status = plan.action === 'unchanged' ? 'unchanged' : 'linked';
  if (plan.action !== 'unchanged') {
    if (plan.action === 'update') unmountDirectory(plan.target);
    kind = mountDirectory(source, plan.target);
    status = plan.action === 'update' ? 'updated' : (kind === 'copy' ? 'copied' : 'linked');
    try {
      upsertLink(wpRoot, { path: linkPath, target: plan.target, source, site: baseUrl, url, kind });
    } catch (error) {
      try {
        unmountDirectory(plan.target);
      } catch {
        // Best effort: the original error is the actionable one.
      }
      throw error;
    }
  }

  const ok = await responds(url);
  const result = {
    site: baseUrl,
    path: linkPath,
    url,
    target: plan.target,
    source,
    kind,
    status,
    reachable: ok,
  };

  if (out.json) {
    out.data(result);
  } else {
    out.ok(`${status} ${path.relative(workspace, source) || source} -> /${linkPath}`);
    out.hint(`target  ${plan.target}`);
    out.hint(`source  ${source}`);
    out.hint(`kind    ${kind}`);
    out.hint(`url     ${url}`);
    if (!ok) out.warn(`${url} did not respond; the link was created.`);
    if (kind === 'copy') out.warn('This platform refused a directory link, so the files were copied. Re-run after changing the source.');
  }

  if (!values['no-open'] && ok) openUrl(url);
  return 0;
}

async function status(context, out, values) {
  const wpRoot = wordpressRoot(context);
  const base = siteUrl(context, values.site);
  const links = listLinks(wpRoot);
  const rows = [];
  for (const entry of links) {
    const info = linkInfo(entry.target);
    rows.push({
      path: entry.path,
      url: linkTarget(base, entry.path),
      target: entry.target,
      source: entry.source,
      kind: entry.kind,
      sourceExists: Boolean(entry.source && fs.existsSync(entry.source)),
      targetExists: fs.existsSync(entry.target),
      reachable: await responds(linkTarget(base, entry.path)),
    });
  }
  if (out.json) {
    out.data({ site: base, links: rows });
    return 0;
  }
  if (rows.length === 0) {
    out.info('No wp-theme-kit links are registered for this site.');
    return 0;
  }
  out.table(
    ['path', 'url', 'kind', 'source', 'target', 'reachable'],
    rows.map((row) => [
      `/${row.path}`,
      row.url,
      row.kind,
      row.sourceExists ? 'ok' : 'missing',
      row.targetExists ? 'ok' : 'missing',
      row.reachable ? 'yes' : 'no',
    ]),
  );
  return 0;
}

async function remove(context, globals, out, values) {
  const wpRoot = wordpressRoot(context);
  const cwd = globals.cwd || process.cwd();
  // Accept a site-relative path, an absolute target path, or a path below the WordPress root.
  const requested = values['link-remove'];
  const candidates = [requested];
  const entry = candidates
    .map((candidate) => {
      try {
        return findLink(wpRoot, candidate);
      } catch {
        return null;
      }
    })
    .find(Boolean) ?? null;
  if (!entry) {
    // Removing a mount that is already gone is a no-op, not a failure.
    const possibleTargets = [
      path.resolve(cwd, requested),
      path.resolve(wpRoot, String(requested).replace(/^\/+/, '')),
    ];
    const existing = possibleTargets.some((candidate) => linkInfo(candidate).exists);
    if (!existing) {
      if (out.json) {
        out.data({ path: requested, removed: false, status: 'absent' });
        return 0;
      }
      out.ok(`nothing to remove for ${requested}`);
      return 0;
    }
    throw new UsageError(`No wptk link is registered at ${requested}.`);
  }
  const linkPath = entry.path;
  const target = resolveLinkTarget(wpRoot, linkPath);
  const outcome = unmountDirectory(target);
  removeLinkEntry(wpRoot, linkPath);
  const removed = outcome === 'removed';
  if (out.json) {
    out.data({
      path: linkPath,
      target,
      removed,
      status: removed ? 'removed' : (outcome === 'absent' ? 'absent' : 'kept'),
    });
    return 0;
  }
  if (removed || outcome === 'absent') {
    out.ok(`removed /${linkPath}`);
  } else {
    out.ok(`unregistered /${linkPath}`);
    out.warn(`${target} is a copied directory; delete it yourself if you no longer need it.`);
  }
  return 0;
}

export async function run({ argv, globals, out }) {
  const parsed = parseArgs(argv, {
    strings: ['url', 'link', 'link-path', 'link-remove', 'site'],
    booleans: ['help', 'link-status', 'no-open'],
    aliases: { h: 'help' },
  });
  if (parsed.values.help) {
    out.line(USAGE);
    return 0;
  }

  const linkMode = Boolean(parsed.values.link || parsed.values['link-status'] || parsed.values['link-remove']);
  if (linkMode && parsed.values.url) {
    throw new UsageError('--url selects a route; use --site for the link modes.');
  }

  const context = loadContext({ cwd: globals.cwd });
  if (!linkMode) {
    const route = resolveRoute(context, parsed.positionals[0], { url: parsed.values.url });
    openUrl(route.url);
    out.ok(`Opened ${route.url}`);
    return 0;
  }

  const modes = [
    parsed.values.link ? '--link' : null,
    parsed.values['link-status'] ? '--link-status' : null,
    parsed.values['link-remove'] ? '--link-remove' : null,
  ].filter(Boolean);
  if (modes.length > 1) {
    throw new UsageError(`${modes.join(' and ')} cannot be combined.`);
  }

  if (parsed.values.link) return link(context, globals, out, parsed.values);
  if (parsed.values['link-status']) return status(context, out, parsed.values);
  return remove(context, globals, out, parsed.values);
}
