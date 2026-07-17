import { useState, useContext, useCallback, createContext } from '../../v1/deps/htm-preact.js';
import { html } from '../htm-wrapper.js';
import { PAGES_CONFIG } from '../constants.js';

const NavigationContext = createContext();

const NavigationProvider = ({ children }) => {
  const [activePage, setActivePage] = useState(PAGES_CONFIG.home);
  const [importSheetScheduleName, setImportSheetScheduleName] = useState(null);

  const goToEditSchedule = useCallback(() => {
    setActivePage(PAGES_CONFIG.editSchedule);
  }, []);

  const goToSheetImport = useCallback((scheduleName) => {
    setActivePage(PAGES_CONFIG.importSheet);
    setImportSheetScheduleName(scheduleName);
  }, []);

  const goToHome = useCallback(() => {
    setActivePage(PAGES_CONFIG.home);
  }, []);

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
  };

  return html`
    <${NavigationContext.Provider} value=${value}>
      ${children}
    </${NavigationContext.Provider}>
  `;
};

const useNavigation = () => useContext(NavigationContext);

export { NavigationContext, NavigationProvider, useNavigation };
