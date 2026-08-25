import { Component } from "react";

export default class ChunkErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error) {
    const msg = error?.message || "";
    if (
      msg.includes("Failed to fetch dynamically imported module") ||
      msg.includes("Importing a module script failed") ||
      msg.includes("Loading chunk") ||
      msg.includes("Unexpected token '<'")
    ) {
      console.warn("[ChunkErrorBoundary] chunk load failed, reloading…", msg);
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 12, fontFamily: "Manrope, sans-serif" }}>
          <p style={{ fontSize: 14, color: "#666" }}>Something went wrong. Reloading…</p>
        </div>
      );
    }
    return this.props.children;
  }
}
