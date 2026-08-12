export const getMetadata = (el) => [...el.childNodes].reduce((rdx, row) => {
  if (row.children) {
    const key = row.children[0].textContent.trim().toLowerCase();
    const content = [...row.children].slice(1);
    const text = content.map((bp) => bp.textContent?.trim().toLowerCase());
    if (key && content) rdx[key] = { content, text };
  }
  return rdx;
}, {});
