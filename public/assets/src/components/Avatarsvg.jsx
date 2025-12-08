// src/components/AvatarSvg.jsx
import React from "react";

/**
 * AvatarSvg
 *
 * Props:
 * - size: number (px) default 48
 * - src: string (optional) - URL or import to an SVG file. If omitted, the component
 *        will attempt to resolve a bundled SVG automatically. If that fails,
 *        a small inline placeholder is used.
 * - alt: string
 * - className: additional class names
 *
 * Notes:
 * - If you place your SVG at `src/assets/df6c1f21-2aaa-4f6a-bc2f-7ef554fe4c65.svg`
 *   the component will attempt to load it automatically for common bundlers.
 * - For Vite you can pass `new URL('/src/assets/...svg', import.meta.url).href`
 *   or just pass `"/assets/your.svg"` if it's in public/.
 */

export default function AvatarSvg({
  size = 48,
  src = undefined,
  alt = "avatar",
  className = "",
  style = {},
}) {
  // Attempt to resolve a default SVG from a few common locations/bundlers.
  // This is conservative: any thrown error is ignored and we fall back to placeholder.
  let resolved = src || null;

  if (!resolved) {
    try {
      // Common for Create React App / Webpack when svg imports return a module with .default
      // Adjust path if you placed the SVG elsewhere (e.g. ../assets/...)
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const maybe = require("../df6c1f21-2aaa-4f6a-bc2f-7ef554fe4c65.svg");
      resolved = (maybe && (maybe.default || maybe)) || resolved;
    } catch (e) {
      // ignore
    }
  }

  if (!resolved) {
    try {
      // Vite-friendly resolution
      // (works if the SVG is at src/assets/df6c1f21-....svg)
      // Note: import.meta is supported in bundlers like Vite; if your environment doesn't
      // support it this will be skipped by the try/catch.
      // eslint-disable-next-line no-undef
      const url = new URL("../df6c1f21-2aaa-4f6a-bc2f-7ef554fe4c65.svg", import.meta.url);
      resolved = url.href;
    } catch (e) {
      // ignore
    }
  }

  // final fallback: small inline SVG data-uri (neutral placeholder)
  const placeholderDataUrl =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160' fill='none'>
        <rect width='160' height='160' rx='16' fill='%23121418'/>
        <g transform='translate(40,32)' fill='%23cbd5e1' opacity='0.9'>
          <circle cx='40' cy='28' r='20' fill='%2399aab3'/>
          <path d='M0 112c0-22 18-40 40-40s40 18 40 40v8H0v-8z' fill='%2399aab3'/>
        </g>
      </svg>`
    );

  const imgSrc = resolved || placeholderDataUrl;

  return (
    <div
      className={`avatar-svg-wrap ${className}`}
      style={{ width: size, height: size, ...style }}
      aria-hidden
    >
      <img
        src={imgSrc}
        alt={alt}
        width={size}
        height={size}
        style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
        onError={(e) => {
          // if resolved src errors at runtime, fall back to placeholder
          if (e?.target) {
            e.target.onerror = null;
            e.target.src = placeholderDataUrl;
          }
        }}
      />
    </div>
  );
}
