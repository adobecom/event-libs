import { useState, useEffect, useCallback, useRef } from '../../../v1/deps/htm-preact.js';
import { html } from '../../htm-wrapper.js';
import Modal from '../Modal.js';
import { useDAContext } from '../../context/DAContext.js';
import { DEFAULT_FRAGMENT_PATH } from '../../constants.js';

async function fetchDAItems(org, repo, contentPath, token) {
  const opts = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  const resp = await fetch(`https://admin.da.live/list/${org}/${repo}${contentPath}`, opts);
  if (resp.status === 401) throw new Error('Unauthorized — you may need DA access. Try signing in at da.live first.');
  if (!resp.ok) throw new Error(`Failed to load (${resp.status})`);
  const items = await resp.json();
  return items
    .filter((item) => !item.ext || item.ext === 'html')
    .sort((a, b) => {
      if (!a.ext && b.ext) return -1;
      if (a.ext && !b.ext) return 1;
      return a.path.localeCompare(b.path);
    });
}

function getItemName(fullPath) {
  return fullPath.split('/').pop();
}

function stripOrgRepo(fullPath, org, repo) {
  return fullPath.replace(`/${org}/${repo}`, '');
}

export default function FragmentPathBrowser({
  isOpen,
  onClose,
  onSelect,
  selectedPath = null,
}) {
  const { org, repo, token } = useDAContext();

  const [columnPaths, setColumnPaths] = useState([]);
  const [columnItems, setColumnItems] = useState([]);
  const [loadingColIndex, setLoadingColIndex] = useState(null);
  const [error, setError] = useState(null);
  const [isDaAuthError, setIsDaAuthError] = useState(false);
  const [selectedFilePath, setSelectedFilePath] = useState(null);
  const [activeFolderPaths, setActiveFolderPaths] = useState([]);

  const columnsRef = useRef(null);

  useEffect(() => {
    if (columnsRef.current) {
      columnsRef.current.scrollLeft = columnsRef.current.scrollWidth;
    }
  }, [columnItems.length]);

  const loadColumn = useCallback(async (colIndex, contentPath) => {
    setLoadingColIndex(colIndex);
    setError(null);
    try {
      const items = await fetchDAItems(org, repo, contentPath, token);
      setColumnItems((prev) => { const next = prev.slice(0, colIndex); next[colIndex] = items; return next; });
      setColumnPaths((prev) => { const next = prev.slice(0, colIndex); next[colIndex] = contentPath; return next; });
    } catch (err) {
      const is401 = err.message.includes('401') || err.message.toLowerCase().includes('unauthorized');
      setIsDaAuthError(is401);
      setError(is401 ? null : err.message);
    } finally {
      setLoadingColIndex(null);
    }
  }, [org, repo, token]);

  // Loads each segment of targetPath as its own column so the full hierarchy is visible.
  const expandToPath = useCallback(async (targetPath) => {
    setError(null);
    setIsDaAuthError(false);
    setColumnItems([]);
    setColumnPaths([]);
    setActiveFolderPaths([]);
    setSelectedFilePath(null);

    const segments = targetPath.split('/').filter(Boolean);
    const pathsToLoad = ['/', ...segments.map((_, i) => `/${segments.slice(0, i + 1).join('/')}`)];
    const uniquePaths = [...new Set(pathsToLoad)];

    for (let i = 0; i < uniquePaths.length; i += 1) {
      setLoadingColIndex(i);
      try {
        // eslint-disable-next-line no-await-in-loop
        const items = await fetchDAItems(org, repo, uniquePaths[i], token);
        setColumnItems((prev) => { const next = [...prev]; next[i] = items; return next; });
        setColumnPaths((prev) => { const next = [...prev]; next[i] = uniquePaths[i]; return next; });
        if (i < uniquePaths.length - 1) {
          const activeChild = uniquePaths[i + 1];
          setActiveFolderPaths((prev) => { const next = [...prev]; next[i] = activeChild; return next; });
        }
      } catch (err) {
        const is401 = err.message.includes('401') || err.message.toLowerCase().includes('unauthorized');
        setIsDaAuthError(is401);
        setError(is401 ? null : err.message);
        setLoadingColIndex(null);
        return;
      }
    }
    setLoadingColIndex(null);
  }, [org, repo, token]);

  useEffect(() => {
    if (!isOpen || !org || !repo) return;
    (async () => {
      if (selectedPath?.startsWith('/')) {
        const lastSlash = selectedPath.lastIndexOf('/');
        const parentDir = lastSlash > 0 ? selectedPath.slice(0, lastSlash) : '/';
        await expandToPath(parentDir);
        setSelectedFilePath(selectedPath);
      } else {
        expandToPath(DEFAULT_FRAGMENT_PATH);
      }
    })();
  }, [isOpen, org, repo]);

  const handleFolderClick = (colIndex, item) => {
    const contentPath = stripOrgRepo(item.path, org, repo);
    setActiveFolderPaths((prev) => { const next = prev.slice(0, colIndex + 1); next[colIndex] = contentPath; return next; });
    setSelectedFilePath(null);
    loadColumn(colIndex + 1, contentPath);
  };

  const handleFileClick = (colIndex, item) => {
    const rawPath = stripOrgRepo(item.path, org, repo);
    const contentPath = item.ext ? rawPath.slice(0, -(item.ext.length + 1)) : rawPath;
    setColumnItems((prev) => prev.slice(0, colIndex + 1));
    setColumnPaths((prev) => prev.slice(0, colIndex + 1));
    setActiveFolderPaths((prev) => prev.slice(0, colIndex));
    setSelectedFilePath(contentPath);
  };

  const handleConfirm = () => {
    if (!selectedFilePath) return;
    onSelect(selectedFilePath);
    onClose();
  };

  const buildBreadcrumb = () => {
    const parts = [{ label: repo, path: null }];
    const deepest = selectedFilePath || activeFolderPaths[activeFolderPaths.length - 1];
    if (deepest) {
      const segments = deepest.split('/').filter(Boolean);
      segments.forEach((seg, i) => {
        parts.push({ label: seg, path: `/${segments.slice(0, i + 1).join('/')}` });
      });
    }
    return parts;
  };

  const handleBreadcrumbClick = (path) => {
    if (!path) { expandToPath('/'); return; }
    const colIndex = columnPaths.indexOf(path);
    if (colIndex !== -1) {
      setColumnItems((prev) => prev.slice(0, colIndex + 1));
      setColumnPaths((prev) => prev.slice(0, colIndex + 1));
      setActiveFolderPaths((prev) => prev.slice(0, colIndex));
      setSelectedFilePath(null);
    } else {
      expandToPath(path);
    }
  };

  const renderDataColumn = (items, colIndex) => html`
    <div class="fpb-column" key=${colIndex}>
      ${items.map((item) => {
        const isFolder = !item.ext;
        const rawPath = stripOrgRepo(item.path, org, repo);
        const contentPath = isFolder ? rawPath : (item.ext ? rawPath.slice(0, -(item.ext.length + 1)) : rawPath);
        const isActiveFolder = isFolder && activeFolderPaths[colIndex] === rawPath;
        const isSelectedFile = !isFolder && selectedFilePath === contentPath;

        return html`
          <div \
            key=${item.path} \
            class="fpb-item ${isFolder ? 'fpb-item--folder' : 'fpb-item--file'} ${isActiveFolder || isSelectedFile ? 'fpb-item--active' : ''}" \
            onClick=${() => (isFolder ? handleFolderClick(colIndex, item) : handleFileClick(colIndex, item))} \
            role="button" \
            tabIndex="0" \
            onKeyDown=${(e) => e.key === 'Enter' && (isFolder ? handleFolderClick(colIndex, item) : handleFileClick(colIndex, item))} \
          >
            <span class="fpb-item-icon">
              ${isFolder
                ? html`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 18 18"><path fill="currentColor" d="M1,4.5v10A1.5,1.5,0,0,0,2.5,16h13A1.5,1.5,0,0,0,17,14.5V6.5A1.5,1.5,0,0,0,15.5,5H9.664a.5.5,0,0,1-.39-.188L7.546,2.688A1.5,1.5,0,0,0,6.378,2.1H2.5A1.5,1.5,0,0,0,1,3.6Z"/></svg>`
                : html`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 18 18"><path fill="currentColor" d="M15.573,5.573l-3.146-3.146A1.5,1.5,0,0,0,11.368,2H4.5A1.5,1.5,0,0,0,3,3.5v11A1.5,1.5,0,0,0,4.5,16h9A1.5,1.5,0,0,0,15,14.5V6.632A1.5,1.5,0,0,0,15.573,5.573ZM13.5,14.5H4.5V3.5h6.378l.005,0,2.614,2.614,0,.005V14.5Z"/></svg>`
              }
            </span>
            <span class="fpb-item-name">${isFolder ? getItemName(item.path) : getItemName(item.path).replace(/\.[^/.]+$/, '')}</span>
            ${isFolder && html`<span class="fpb-item-chevron">›</span>`}
            ${isSelectedFile && html`<span class="fpb-item-check">✓</span>`}
          </div>
        `;
      })}
    </div>
  `;

  const breadcrumb = buildBreadcrumb();

  return html`
    <${Modal} \
      isOpen=${isOpen} \
      onClose=${onClose} \
      title="Browse Fragments" \
      confirmText="Select" \
      cancelText="Cancel" \
      onConfirm=${handleConfirm} \
      size="large" \
    >
      <div class="fpb-wrapper">
        ${error && html`<div class="fpb-error">${error}</div>`}
        ${isDaAuthError && html`
          <div class="fpb-auth-error">
            <p class="fpb-auth-error-msg">Sign-in required to browse Document Authoring fragments.</p>
            <div class="fpb-auth-error-actions">
              <a \
                href="https://da.live/#/${org}/${repo}${DEFAULT_FRAGMENT_PATH}" \
                target="_blank" \
                rel="noopener noreferrer" \
                class="fpb-open-da-btn" \
              >Open in DA to browse &amp; copy path</a>
              <button class="fpb-retry-btn" onClick=${() => loadColumn(0, DEFAULT_FRAGMENT_PATH)}>Retry</button>
            </div>
          </div>
        `}
        <div class="fpb-columns ${isDaAuthError ? 'fpb-columns--hidden' : ''}" ref=${columnsRef}>
          ${columnItems.map((items, i) => renderDataColumn(items, i))}
          ${loadingColIndex !== null && html`
            <div class="fpb-column fpb-column--loading">
              <div class="fpb-loading">
                <sp-progress-circle indeterminate size="s"></sp-progress-circle>
              </div>
            </div>
          `}
        </div>
        <nav class="fpb-breadcrumbs" aria-label="Path breadcrumb">
          ${breadcrumb.map((crumb, i) => html`
            ${i > 0 && html`<span class="fpb-breadcrumb-sep">›</span>`}
            <button \
              class="fpb-breadcrumb-btn ${i === breadcrumb.length - 1 ? 'fpb-breadcrumb-btn--current' : ''}" \
              onClick=${() => handleBreadcrumbClick(crumb.path)} \
              disabled=${i === breadcrumb.length - 1} \
            >${crumb.label}</button>
          `)}
        </nav>
        ${selectedFilePath && html`
          <div class="fpb-selected-path">
            <span class="fpb-selected-label">Selected:</span>
            <code class="fpb-selected-value">${selectedFilePath}</code>
          </div>
        `}
      </div>
    </${Modal}>
  `;
}
