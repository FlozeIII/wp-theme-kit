/**
 * Gettext call signatures used by WordPress.
 *
 * Positions are zero-based argument indexes.
 */
export const GETTEXT_SIGNATURES = {
  __: { msgid: 0, domain: 1 },
  _e: { msgid: 0, domain: 1 },
  esc_html__: { msgid: 0, domain: 1 },
  esc_html_e: { msgid: 0, domain: 1 },
  esc_attr__: { msgid: 0, domain: 1 },
  esc_attr_e: { msgid: 0, domain: 1 },
  esc_xml__: { msgid: 0, domain: 1 },
  esc_xml_e: { msgid: 0, domain: 1 },
  translate: { msgid: 0, domain: 1 },

  _x: { msgid: 0, context: 1, domain: 2 },
  _ex: { msgid: 0, context: 1, domain: 2 },
  esc_html_x: { msgid: 0, context: 1, domain: 2 },
  esc_attr_x: { msgid: 0, context: 1, domain: 2 },
  translate_with_gettext_context: { msgid: 0, context: 1, domain: 2 },

  _n: { msgid: 0, plural: 1, domain: 3 },
  _nx: { msgid: 0, plural: 1, context: 3, domain: 4 },
  _n_noop: { msgid: 0, plural: 1, domain: 2 },
  _nx_noop: { msgid: 0, plural: 1, context: 2, domain: 3 },
};

export const GETTEXT_NAMES = new Set(Object.keys(GETTEXT_SIGNATURES));

export function escapePotString(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}

export function unescapePotString(value) {
  return String(value).replace(/\\(.)/g, (_, code) => {
    switch (code) {
      case 'n': return '\n';
      case 'r': return '\r';
      case 't': return '\t';
      case '"': return '"';
      case '\\': return '\\';
      default: return code;
    }
  });
}

export function entryKey(entry) {
  return `${entry.context ?? ''}\u0000${entry.msgid}\u0000${entry.msgidPlural ?? ''}`;
}
