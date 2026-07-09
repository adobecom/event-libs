import { useState, useContext, useCallback, createContext } from '../../../v1/deps/htm-preact.js';
import { html } from '../htm-wrapper.js';
import { PAGES_CONFIG } from '../constants.js';

const NavigationContext = createContext();

const NavigationProvider = ({ children }) => {
  const [activePage, setActivePage] = useState(PAGES_CONFIG.home);
  const [importSheetScheduleName, setImportSheetScheduleName] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const goToEditSchedule = useCallback(() => {
    if (hasUnsavedChanges) {
      // eslint-disable-next-line no-alert
      alert('You have unsaved changes. Please save or discard them before editing a schedule.');
      return;
    }
    setActivePage(PAGES_CONFIG.editSchedule);
  }, [hasUnsavedChanges]);

  const goToSheetImport = useCallback((scheduleName) => {
    if (hasUnsavedChanges) {
      // eslint-disable-next-line no-alert
      alert('You have unsaved changes. Please save or discard them before importing a sheet.');
      return;
    }
    setActivePage(PAGES_CONFIG.importSheet);
    setImportSheetScheduleName(scheduleName);
  }, [hasUnsavedChanges]);

  const goToHome = useCallback(() => {
    if (hasUnsavedChanges) {
      // eslint-disable-next-line no-alert
      alert('You have unsaved changes. Please save or discard them before going home.');
      return;
    }
    setActivePage(PAGES_CONFIG.home);
  }, [hasUnsavedChanges]);

  const clearImportSheetScheduleName = useCallback(() => {
    setImportSheetScheduleName(null);
  }, []);

  const value = {
    activePage,
    setActivePage,
    importSheetScheduleName,
    goToEditSchedule,
    goToSheetImport,
    goToHome,
    clearImportSheetScheduleName,
    hasUnsavedChanges,
    setHasUnsavedChanges,
  };

  return html`
    <${NavigationContext.Provider} value=${value}>
      ${children}
    </${NavigationContext.Provider}>
  `;
};

const useNavigation = () => useContext(NavigationContext);

export { NavigationContext, NavigationProvider, useNavigation };
