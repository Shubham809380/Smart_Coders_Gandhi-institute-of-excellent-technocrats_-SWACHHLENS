import { useState, useEffect } from "react";

/**
 * Drop-in <img> replacement for report photos. If the URL is empty or fails
 * to load (e.g. a legacy row whose bytes were lost on the old ephemeral
 * storage), it renders the standard photo placeholder instead of a broken
 * image icon or a silent blank box.
 */
export default function SafeImage({ src, alt = "", className = "", iconSize = "text-[22px]" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return (
      <div className={`w-full h-full flex items-center justify-center bg-gray-100 ${className}`}>
        <span className={`material-symbols-outlined text-gray-300 ${iconSize}`}>photo</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
