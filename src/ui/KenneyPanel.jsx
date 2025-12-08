import React from "react";

/**
 * KenneyPanel
 * props:
 *  - variant: "minimal" | "standard" | "ornate"  (default: "standard")
 *  - className: additional class
 */
export default function KenneyPanel({ variant = "standard", className = "", children, ...rest }) {
  const map = {
    minimal: "ui-panel-minimal",
    standard: "ui-panel",
    ornate: "ui-panel-ornate"
  };
  const base = map[variant] || map.standard;
  const hasCorners = variant === "ornate";

  return (
    <div className={`${base} ${className}`} {...rest}>
      {hasCorners && <>
        <div className="ui-corner tl" />
        <div className="ui-corner tr" />
        <div className="ui-corner bl" />
        <div className="ui-corner br" />
      </>}
      <div className="content">{children}</div>
    </div>
  );
}
