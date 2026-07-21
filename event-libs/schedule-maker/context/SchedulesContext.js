import { createContext, useState, useContext, useCallback, useEffect, useMemo } from '../../v1/deps/htm-preact.js';
import { html } from '../htm-wrapper.js';
import { syncSchedules as syncSchedulesController } from '../scripts/da-controller.js';
import {
  assignIdToBlocks,
  isBlockComplete,
  isScheduleComplete,
  prepareScheduleForServer,
  prepareScheduleForClient,
} from '../utils.js';
import { useDA } from './DAContext.js';

const SchedulesContext = createContext();

const SchedulesProvider = ({ children }) => {
  const { org, repo } = useDA();

  const [eventFolder, setEventFolder] = useState(() => localStorage.getItem('sm-last-event-folder') || null);
  const [schedules, setSchedules] = useState([]);
  const [docRefs, setDocRefs] = useState({});
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
      const { schedules: found, docRefs: refs } = result.data;
      setSchedules(found.map((s) => prepareScheduleForClient(s)));
      setDocRefs(refs);
      setHasSynced(true);
      setToastSuccess(`Sync complete — ${found.length} schedule(s) found`);
    } catch (err) {
      setToastError(err.message || 'Sync failed');
    } finally {
      setIsInitialLoading(false);
    }
  }, [org, repo, eventFolder]);

  const updateScheduleLocally = useCallback((title) => {
    setToastError(null);
    setActiveScheduleState((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, title };
      return { ...updated, isComplete: isScheduleComplete(updated) };
    });
  }, []);

  const discardChangesToActiveSchedule = useCallback(() => {
    setActiveScheduleState(originalActiveSchedule);
    setToastError(null);
  }, [originalActiveSchedule]);

  const addBlockLocally = useCallback((block) => {
    setActiveScheduleState((prev) => {
      if (!prev) return prev;
      const updatedBlocks = [...prev.blocks, block];
      return { ...prev, blocks: updatedBlocks, isComplete: isScheduleComplete({ ...prev, blocks: updatedBlocks }) };
    });
    setToastError(null);
  }, []);

  const updateBlockLocally = useCallback((blockId, updates) => {
    setActiveScheduleState((prev) => {
      if (!prev) return prev;
      const blockToUpdate = prev.blocks.find((b) => b.id === blockId);
      if (!blockToUpdate) return prev;
      const updatedBlock = { ...blockToUpdate, ...updates };
      updatedBlock.isComplete = isBlockComplete(updatedBlock);
      const updatedBlocks = prev.blocks.map((b) => (b.id === blockId ? updatedBlock : b));
      return { ...prev, blocks: updatedBlocks, isComplete: isScheduleComplete({ ...prev, blocks: updatedBlocks }) };
    });
    setToastError(null);
  }, []);

  const deleteBlockLocally = useCallback((blockId) => {
    setActiveScheduleState((prev) => {
      if (!prev) return prev;
      const updatedBlocks = prev.blocks.filter((b) => b.id !== blockId);
      return { ...prev, blocks: updatedBlocks, isComplete: isScheduleComplete({ ...prev, blocks: updatedBlocks }) };
    });
  }, []);

  // Moves draggedBlockId to sit just before targetBlockId. Order is otherwise
  // untouched by add/update/delete, so this manual order survives until the
  // next prepareScheduleForClient re-sort by startDateTime.
  const reorderBlocksLocally = useCallback((draggedBlockId, targetBlockId) => {
    setActiveScheduleState((prev) => {
      if (!prev || draggedBlockId === targetBlockId) return prev;
      const blocks = [...prev.blocks];
      const fromIndex = blocks.findIndex((b) => b.id === draggedBlockId);
      const toIndex = blocks.findIndex((b) => b.id === targetBlockId);
      if (fromIndex === -1 || toIndex === -1) return prev;
      const [moved] = blocks.splice(fromIndex, 1);
      blocks.splice(toIndex, 0, moved);
      return { ...prev, blocks };
    });
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
    docRefs,
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
    docRefs: ctx.docRefs,
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
