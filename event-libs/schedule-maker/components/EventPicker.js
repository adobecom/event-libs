import { useState, useCallback, useEffect, useRef } from '../../v1/deps/htm-preact.js';
import { html } from '../htm-wrapper.js';
import Modal from './Modal.js';
import { useDAContext } from '../context/DAContext.js';
import { useSchedulesData, useSchedulesOperations } from '../context/SchedulesContext.js';
import { listFolder } from '../scripts/da-controller.js';

async function fetchFolders(org, repo, path) {
  const result = await listFolder(org, repo, path);
  if (!result.ok) {
    if (result.status === 401) throw new Error('Unauthorized — sign in at da.live first.');
    throw new Error(`Failed to load (${result.status})`);
  }
  return (result.data || []).filter((item) => !item.ext);
}

function getItemName(fullPath) {
  return fullPath.split('/').pop();
}

function stripOrgRepo(fullPath, org, repo) {
  return fullPath.replace(`/${org}/${repo}`, '');
}

function FolderBrowser({ isOpen, onClose, onSelect, initialPath }) {
  const { org, repo } = useDAContext();

  const [columnPaths, setColumnPaths] = useState([]);
  const [columnItems, setColumnItems] = useState([]);
  const [loadingColIndex, setLoadingColIndex] = useState(null);
  const [error, setError] = useState(null);
  const [activeFolderPaths, setActiveFolderPaths] = useState([]);
  const [selectedFolderPath, setSelectedFolderPath] = useState(null);

  const columnsRef = useRef(null);

  useEffect(() => {
    if (columnsRef.current) {
      columnsRef.current.scrollLeft = columnsRef.current.scrollWidth;
    }
  }, [columnItems.length]);

  const loadColumn = useCallback(async (colIndex, path) => {
    setLoadingColIndex(colIndex);
    setError(null);
    try {
      const items = await fetchFolders(org, repo, path);
      setColumnItems((prev) => { const next = prev.slice(0, colIndex); next[colIndex] = items; return next; });
      setColumnPaths((prev) => { const next = prev.slice(0, colIndex); next[colIndex] = path; return next; });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingColIndex(null);
    }
  }, [org, repo]);

  useEffect(() => {
    if (!isOpen || !org || !repo) return;

    setColumnItems([]);
    setColumnPaths([]);
    setActiveFolderPaths([]);
    setError(null);

    const segments = (initialPath && initialPath !== '/') ? initialPath.split('/').filter(Boolean) : [];
    setSelectedFolderPath(initialPath || '/');

    const init = async () => {
      const newColumnItems = [];
      const newColumnPaths = [];
      const newActiveFolderPaths = [];
      let path = '/';

      for (let i = 0; i <= segments.length; i += 1) {
        setLoadingColIndex(i);
        try {
          const items = await fetchFolders(org, repo, path);
          newColumnItems.push(items);
          newColumnPaths.push(path);
          if (i < segments.length) {
            path = `/${segments.slice(0, i + 1).join('/')}`;
            newActiveFolderPaths.push(path);
          }
        } catch (err) {
          setError(err.message);
          break;
        }
      }

      setColumnItems(newColumnItems);
      setColumnPaths(newColumnPaths);
      setActiveFolderPaths(newActiveFolderPaths);
      setLoadingColIndex(null);
    };

    init();
  }, [isOpen, org, repo]);

  const handleFolderClick = (colIndex, item) => {
    const path = stripOrgRepo(item.path, org, repo);
    setActiveFolderPaths((prev) => { const next = prev.slice(0, colIndex + 1); next[colIndex] = path; return next; });
    setSelectedFolderPath(path);
    loadColumn(colIndex + 1, path);
  };

  const handleConfirm = () => {
    onSelect(selectedFolderPath);
    onClose();
  };

  const buildBreadcrumb = () => {
    const parts = [{ label: repo, path: null }];
    const deepest = activeFolderPaths[activeFolderPaths.length - 1];
    if (deepest) {
      const segments = deepest.split('/').filter(Boolean);
      segments.forEach((seg, i) => {
        parts.push({ label: seg, path: `/${segments.slice(0, i + 1).join('/')}` });
      });
    }
    return parts;
  };

  const handleBreadcrumbClick = (path) => {
    if (!path) {
      setColumnItems([]);
      setColumnPaths([]);
      setActiveFolderPaths([]);
      setSelectedFolderPath('/');
      loadColumn(0, '/');
      return;
    }
    const colIndex = columnPaths.indexOf(path);
    if (colIndex !== -1) {
      setColumnItems((prev) => prev.slice(0, colIndex + 1));
      setColumnPaths((prev) => prev.slice(0, colIndex + 1));
      setActiveFolderPaths((prev) => prev.slice(0, colIndex));
      setSelectedFolderPath(activeFolderPaths[colIndex - 1] || null);
    }
  };

  const breadcrumb = buildBreadcrumb();

  return html`
    <${Modal}
      isOpen=${isOpen}
      onClose=${onClose}
      title="Select Event Folder"
      confirmText="Select"
      cancelText="Cancel"
      onConfirm=${handleConfirm}
      size="large"
    >
      <div class="fpb-wrapper">
        ${error && html`<div class="fpb-error">${error}</div>`}
        <div class="fpb-columns" ref=${columnsRef}>
          <div class="fpb-column">
            <div
              class="fpb-item fpb-item--folder ${selectedFolderPath === '/' ? 'fpb-item--active' : ''}"
              onClick=${() => { setActiveFolderPaths([]); setSelectedFolderPath('/'); setColumnItems((prev) => prev.slice(0, 1)); setColumnPaths((prev) => prev.slice(0, 1)); }}
              role="button"
              tabIndex="0"
              onKeyDown=${(e) => e.key === 'Enter' && (setActiveFolderPaths([]), setSelectedFolderPath('/'), setColumnItems((prev) => prev.slice(0, 1)), setColumnPaths((prev) => prev.slice(0, 1)))}
            >
              <span class="fpb-item-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 18 18">
                  <path fill="currentColor" d="M1,4.5v10A1.5,1.5,0,0,0,2.5,16h13A1.5,1.5,0,0,0,17,14.5V6.5A1.5,1.5,0,0,0,15.5,5H9.664a.5.5,0,0,1-.39-.188L7.546,2.688A1.5,1.5,0,0,0,6.378,2.1H2.5A1.5,1.5,0,0,0,1,3.6Z"/>
                </svg>
              </span>
              <span class="fpb-item-name">/ (repo root)</span>
              <span class="fpb-item-chevron">›</span>
            </div>
          </div>
          ${columnItems.map((items, i) => html`
            <div class="fpb-column" key=${i}>
              ${items.map((item) => {
                const isFolder = !item.ext;
                const path = stripOrgRepo(item.path, org, repo);
                const isActive = activeFolderPaths[i] === path;
                const handleClick = isFolder ? () => handleFolderClick(i, item) : undefined;
                return html`
                  <div
                    key=${item.path}
                    class="fpb-item ${isFolder ? 'fpb-item--folder' : 'fpb-item--file'} ${isActive ? 'fpb-item--active' : ''}"
                    onClick=${handleClick}
                    role=${isFolder ? 'button' : undefined}
                    tabIndex=${isFolder ? '0' : undefined}
                    onKeyDown=${isFolder ? (e) => e.key === 'Enter' && handleFolderClick(i, item) : undefined}
                  >
                    <span class="fpb-item-icon">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 18 18">
                        <path fill="currentColor" d="M1,4.5v10A1.5,1.5,0,0,0,2.5,16h13A1.5,1.5,0,0,0,17,14.5V6.5A1.5,1.5,0,0,0,15.5,5H9.664a.5.5,0,0,1-.39-.188L7.546,2.688A1.5,1.5,0,0,0,6.378,2.1H2.5A1.5,1.5,0,0,0,1,3.6Z"/>
                      </svg>
                    </span>
                    <span class="fpb-item-name">${getItemName(item.path)}</span>
                    ${isFolder && html`<span class="fpb-item-chevron">›</span>`}
                  </div>
                `;
              })}
            </div>
          `)}
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
            <button
              class="fpb-breadcrumb-btn ${i === breadcrumb.length - 1 ? 'fpb-breadcrumb-btn--current' : ''}"
              onClick=${() => handleBreadcrumbClick(crumb.path)}
              disabled=${i === breadcrumb.length - 1}
            >${crumb.label}</button>
          `)}
        </nav>
        <div class="fpb-selected-path">
          <span class="fpb-selected-label">Selected:</span>
          <code class="fpb-selected-value">${selectedFolderPath}</code>
        </div>
      </div>
    </${Modal}>
  `;
}

export default function EventPicker() {
  const { org, repo } = useDAContext();
  const { eventFolder, setEventFolder } = useSchedulesData();
  const { syncSchedules } = useSchedulesOperations();
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [inputValue, setInputValue] = useState(eventFolder || '');

  useEffect(() => { setInputValue(eventFolder || ''); }, [eventFolder]);

  if (!org || !repo) return null;

  const handleInputBlur = () => {
    const trimmed = inputValue.trim();
    if (trimmed && trimmed !== eventFolder) setEventFolder(trimmed);
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter') e.target.blur();
  };

  return html`
    <div class="sm-event-picker">
      <sp-field-label size="l"><strong>Folder to fetch schedule links</strong></sp-field-label>
      <div class="sm-event-picker__row">
        <sp-textfield
          type="text"
          value=${inputValue}
          placeholder="Select or type a folder path"
          oninput=${(e) => setInputValue(e.target.value)}
          onblur=${handleInputBlur}
          onkeydown=${handleInputKeyDown}
        />
        <sp-action-button quiet size="l" onClick=${() => setIsBrowserOpen(true)} aria-label="Browse for event folder" title="Browse for event folder">
          <sp-icon slot="icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
              <path fill="currentColor" d="M1,4.5v10A1.5,1.5,0,0,0,2.5,16h13A1.5,1.5,0,0,0,17,14.5V6.5A1.5,1.5,0,0,0,15.5,5H9.664a.5.5,0,0,1-.39-.188L7.546,2.688A1.5,1.5,0,0,0,6.378,2.1H2.5A1.5,1.5,0,0,0,1,3.6Z"/>
            </svg>
          </sp-icon>
        </sp-action-button>
        <sp-action-button quiet size="l" onClick=${() => syncSchedules()} aria-label="Sync schedules" title="Scan event folder to find schedule links in documents">
          <sp-icon slot="icon">
            <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 0 18 18" width="18">
              <path fill="currentColor" d="M16.337,10H15.39a.6075.6075,0,0,0-.581.469A5.7235,5.7235,0,0,1,5.25,13.006l-.346-.3465L6.8815,10.682A.392.392,0,0,0,7,10.4a.4.4,0,0,0-.377-.4H1.25a.25.25,0,0,0-.25.25v5.375A.4.4,0,0,0,1.4,16a.3905.3905,0,0,0,.28-.118l1.8085-1.8085.178.1785a8.09048,8.09048,0,0,0,3.642,2.1655,7.715,7.715,0,0,0,9.4379-5.47434q.04733-.178.0861-.35816A.5.5,0,0,0,16.337,10Z"/>
              <path fill="currentColor" d="M16.6,2a.3905.3905,0,0,0-.28.118L14.5095,3.9265l-.178-.1765a8.09048,8.09048,0,0,0-3.642-2.1655A7.715,7.715,0,0,0,1.25269,7.06072q-.04677.17612-.08519.35428A.5.5,0,0,0,1.663,8H2.61a.6075.6075,0,0,0,.581-.469A5.7235,5.7235,0,0,1,12.75,4.994l.346.3465L11.1185,7.318A.392.392,0,0,0,11,7.6a.4.4,0,0,0,.377.4H16.75A.25.25,0,0,0,17,7.75V2.377A.4.4,0,0,0,16.6,2Z"/>
            </svg>
          </sp-icon>
        </sp-action-button>
      </div>
      <${FolderBrowser}
        isOpen=${isBrowserOpen}
        onClose=${() => setIsBrowserOpen(false)}
        onSelect=${(path) => setEventFolder(path)}
        initialPath=${eventFolder}
      />
    </div>
  `;
}
