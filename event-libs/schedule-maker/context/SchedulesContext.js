import { createContext, useState, useContext, useCallback, useEffect, useMemo } from '../../v1/deps/htm-preact.js';
import { html } from '../htm-wrapper.js';
import { syncSchedules as syncSchedulesController } from '../scripts/da-controller.js';
import {
  assignIdToBlocks,
  prepareScheduleForServer,
  prepareScheduleForClient,
  setScheduleTitle,
  addBlockToSchedule,
  updateBlockInSchedule,
  deleteBlockFromSchedule,
  reorderBlocksInSchedule,
  sortBlocks,
} from '../utils.js';
import { useDA } from './DAContext.js';

const SchedulesContext = createContext();

const SchedulesProvider = ({ children }) => {
  const { org, repo } = useDA();

  const [eventFolder, setEventFolder] = useState(() => localStorage.getItem('sm-last-event-folder') || null);
  const [schedules, setSchedules] = useState([]);
  const [hasSynced, setHasSynced] = useState(false);
  const [originalActiveSchedule, setOriginalActiveSchedule] = useState(null);
  const [activeSchedule, setActiveScheduleState] = useState(null);
  const [toastSuccess, setToastSuccess] = useState(null);

  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [error, setError] = useState(null);
  const [toastError, setToastError] = useState(null);

  const hasUnsavedChanges = useMemo(() => {
    const original = JSON.stringify(prepareScheduleForServer(originalActiveSchedule));
    const current = JSON.stringify(prepareScheduleForServer(activeSchedule));
    return original !== current;
  }, [originalActiveSchedule, activeSchedule]);

  const setActiveScheduleWithOriginal = useCallback((schedule) => {
    if (schedule) {
      const cloned = JSON.parse(JSON.stringify(schedule));
      assignIdToBlocks(cloned);
      localStorage.setItem('sm-last-schedule-id', cloned.scheduleId);
      setOriginalActiveSchedule(cloned);
      setActiveScheduleState(cloned);
    } else {
      localStorage.removeItem('sm-last-schedule-id');
      setOriginalActiveSchedule(null);
      setActiveScheduleState(null);
    }
  }, []);

  // Creates a schedule in memory only — no server write. Returns the decorated
  // client-side schedule so the caller can set it as active and open the editor.
  const createAndAddSchedule = useCallback((schedule) => {
    const newSchedule = prepareScheduleForClient({
      ...schedule,
      scheduleId: crypto.randomUUID(),
      createdTime: new Date().toISOString(),
      modificationTime: new Date().toISOString(),
      blocks: schedule.blocks || [],
    });
    setSchedules((prev) => [newSchedule, ...prev]);
    return newSchedule;
  }, []);

  const syncSchedules = useCallback(async () => {
    if (!org || !repo || !eventFolder) return;
    setIsInitialLoading(true);
    setError(null);
    setToastError(null);
    try {
      const result = await syncSchedulesController(org, repo, eventFolder);
      if (!result.ok) {
        setToastError(result.error || 'Sync failed');
        return;
      }
      const { schedules: found } = result.data;
      setSchedules(found.map((s) => prepareScheduleForClient(s)));
      setHasSynced(true);

      const conflicted = found.filter((s) => s.hasConflictingVersions);
      if (conflicted.length > 0) {
        conflicted.forEach((s) => {
          const siblingLines = s.conflictingVersions
            .map((sib) => `    - "${sib.title}" — ${sib.referencedInDocs.join(', ') || 'no doc found'}`)
            .join('\n');
          console.warn(
            `[schedule-maker sync] "${s.title}" (${s.referencedInDocs.join(', ') || 'no doc found'}) shares a `
            + `scheduleId with ${s.conflictingVersions.length} other version(s):\n${siblingLines}`,
          );
        });
        setToastSuccess(
          `Sync complete — ${found.length} schedule(s) found, ${conflicted.length} with conflicting versions (see console)`,
        );
      } else {
        setToastSuccess(`Sync complete — ${found.length} schedule(s) found`);
      }
    } catch (err) {
      setToastError(err.message || 'Sync failed');
    } finally {
      setIsInitialLoading(false);
    }
  }, [org, repo, eventFolder]);

  const updateScheduleLocally = useCallback((title) => {
    setToastError(null);
    setActiveScheduleState((prev) => setScheduleTitle(prev, title));
  }, []);

  const discardChangesToActiveSchedule = useCallback(() => {
    setActiveScheduleState(originalActiveSchedule);
    setToastError(null);
  }, [originalActiveSchedule]);

  const addBlockLocally = useCallback((block) => {
    setActiveScheduleState((prev) => addBlockToSchedule(prev, block));
    setToastError(null);
  }, []);

  const updateBlockLocally = useCallback((blockId, updates) => {
    setActiveScheduleState((prev) => updateBlockInSchedule(prev, blockId, updates));
    setToastError(null);
  }, []);

  const deleteBlockLocally = useCallback((blockId) => {
    setActiveScheduleState((prev) => deleteBlockFromSchedule(prev, blockId));
  }, []);

  const reorderBlocksLocally = useCallback((draggedBlockId, targetBlockId) => {
    setActiveScheduleState((prev) => reorderBlocksInSchedule(prev, draggedBlockId, targetBlockId));
  }, []);

  // Mirrors the auto-sort applied to the exported link (see prepareScheduleForServer)
  // so the editor's visible block order matches what was just copied, rather than
  // leaving the on-screen list looking out of order after a "blocks were sorted" toast.
  const sortBlocksLocally = useCallback(() => {
    setActiveScheduleState((prev) => (prev ? { ...prev, blocks: sortBlocks(prev.blocks) } : prev));
  }, []);

  const clearToastError = useCallback(() => setToastError(null), []);
  const clearToastSuccess = useCallback(() => setToastSuccess(null), []);

  useEffect(() => {
    if (eventFolder) localStorage.setItem('sm-last-event-folder', eventFolder);
  }, [eventFolder]);

  const value = {
    schedules,
    setSchedules,
    activeSchedule,
    setActiveSchedule: setActiveScheduleWithOriginal,
    eventFolder,
    setEventFolder,
    hasSynced,
    isInitialLoading,
    error,
    toastError,
    clearToastError,
    setToastError,
    toastSuccess,
    clearToastSuccess,
    setToastSuccess,
    hasUnsavedChanges,
    createAndAddSchedule,
    updateScheduleLocally,
    addBlockLocally,
    updateBlockLocally,
    deleteBlockLocally,
    reorderBlocksLocally,
    sortBlocksLocally,
    discardChangesToActiveSchedule,
    syncSchedules,
  };

  return html`
    <${SchedulesContext.Provider} value=${value}>
      ${children}
    </${SchedulesContext.Provider}>
  `;
};

const useSchedules = () => useContext(SchedulesContext);

export const useSchedulesData = () => {
  const ctx = useContext(SchedulesContext);
  return {
    schedules: ctx.schedules,
    activeSchedule: ctx.activeSchedule,
    setSchedules: ctx.setSchedules,
    setActiveSchedule: ctx.setActiveSchedule,
    hasUnsavedChanges: ctx.hasUnsavedChanges,
    eventFolder: ctx.eventFolder,
    setEventFolder: ctx.setEventFolder,
    hasSynced: ctx.hasSynced,
  };
};

export const useSchedulesOperations = () => {
  const ctx = useContext(SchedulesContext);
  return {
    createAndAddSchedule: ctx.createAndAddSchedule,
    updateScheduleLocally: ctx.updateScheduleLocally,
    addBlockLocally: ctx.addBlockLocally,
    updateBlockLocally: ctx.updateBlockLocally,
    deleteBlockLocally: ctx.deleteBlockLocally,
    reorderBlocksLocally: ctx.reorderBlocksLocally,
    sortBlocksLocally: ctx.sortBlocksLocally,
    discardChangesToActiveSchedule: ctx.discardChangesToActiveSchedule,
    syncSchedules: ctx.syncSchedules,
  };
};

export const useSchedulesUI = () => {
  const ctx = useContext(SchedulesContext);
  return {
    isInitialLoading: ctx.isInitialLoading,
    error: ctx.error,
    toastError: ctx.toastError,
    toastSuccess: ctx.toastSuccess,
    clearToastError: ctx.clearToastError,
    clearToastSuccess: ctx.clearToastSuccess,
    setToastSuccess: ctx.setToastSuccess,
    setToastError: ctx.setToastError,
    hasUnsavedChanges: ctx.hasUnsavedChanges,
  };
};

export { SchedulesContext, SchedulesProvider, useSchedules };
