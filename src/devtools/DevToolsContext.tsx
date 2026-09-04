import React, { createContext, useContext, useState } from 'react';

type DevToolsContextValue = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
};

const DevToolsContext = createContext<DevToolsContextValue | null>(null);

/**
 * Whether dev tooling is visible right now. Starts equal to `__DEV__` — on
 * for the normal `expo start` workflow, permanently absent from a real
 * production bundle — but is flippable at runtime so a dev build can also be
 * previewed as the finished product without a rebuild. Not persisted: each
 * fresh dev session starts back at `__DEV__`.
 */
export function DevToolsProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(__DEV__);
  return (
    <DevToolsContext.Provider value={{ enabled, setEnabled }}>
      {children}
    </DevToolsContext.Provider>
  );
}

export function useDevTools() {
  const value = useContext(DevToolsContext);
  if (!value) throw new Error('useDevTools must be used within a DevToolsProvider');
  return value;
}
