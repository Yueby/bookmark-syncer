import { useEffect, useState } from "react";
import browser from "webextension-polyfill";

export function useStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);

  useEffect(() => {
    browser.storage.local.get([key]).then((result) => {
      if (result[key] !== undefined) {
        setValue(result[key] as T);
      }
    });

    const listener = (changes: Record<string, browser.Storage.StorageChange>) => {
      if (changes[key]) {
        setValue(changes[key].newValue as T);
      }
    };

    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, [key]);

  const setStorageValue = (newValue: T) => {
    setValue(newValue);
    browser.storage.local.set({ [key]: newValue });
  };

  return [value, setStorageValue] as const;
}
