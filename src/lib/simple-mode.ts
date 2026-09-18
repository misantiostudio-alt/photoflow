import { useSyncExternalStore } from "react";

const STORAGE_KEY = "photoflow-simple-mode";
const CHANGE_EVENT = "photoflow-simple-mode-change";

function readMode() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(STORAGE_KEY) !== "complete";
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

export function useSimpleMode() {
  return useSyncExternalStore(subscribe, readMode, () => true);
}

export function setSimpleMode(simple: boolean) {
  window.localStorage.setItem(STORAGE_KEY, simple ? "simple" : "complete");
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
