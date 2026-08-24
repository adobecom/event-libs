import HtmlSanitizer from '../../../../deps/html-sanitizer.js';

// Some catalog copy is authored as HTML rather than plain text — `Legal Disclaimer` arrives as
// `<p><b>…</b></p><br/> <p><b>… <a href="…">Terms of Use</a> …</b></p>` — so it has to be
// rendered as markup or the tags show up on screen. It reaches us over the wire from ESP, so it
// goes through the vendored sanitizer first: only whitelisted tags and attributes survive and
// every href is protocol-checked against the schema whitelist.
//
// Links are forced to open in a new tab. The detail view is a drawer overlay, so following a
// legal link in place would silently discard the visitor's place in the guide — and `noopener
// noreferrer` is the security-correct pairing for a target we don't control. Matches how this
// component already renders its session-resource links.
export function sanitizedRichText(raw) {
  if (!raw) return '';
  const clean = HtmlSanitizer.SanitizeHtml(String(raw));
  if (!clean.includes('<a')) return clean;

  const doc = new DOMParser().parseFromString(`<body>${clean}</body>`, 'text/html');
  doc.body.querySelectorAll('a[href]').forEach((anchor) => {
    anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noopener noreferrer');
  });
  return doc.body.innerHTML;
}
