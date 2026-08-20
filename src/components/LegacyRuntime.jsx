import { useEffect } from "react";
/**
 * Keeps the fully working pre-migration screens available while they are
 * progressively converted into React components. The legacy module owns only
 * the #app subtree; React owns the root and all new application code.
 */
export function LegacyRuntime() {
  useEffect(() => { import("../app.js"); }, []);
  return <div id="app" />;
}