/** Link to the installed, offline catalogue using an explicit rule anchor. */
export function ruleDocumentationUrl(ruleId) {
  const url = new URL('../../skills/wp-theme-dev/references/checks.md', import.meta.url);
  url.hash = ruleId.replaceAll('.', '-');
  return url.href;
}
