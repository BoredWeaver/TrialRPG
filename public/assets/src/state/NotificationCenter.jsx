// src/ui/NotificationCenter.jsx
import React, { useEffect, useState } from "react";
import { gameEvents } from "../state/gameEvents";

export default function NotificationCenter() {
  const [list, setList] = useState([]);

  useEffect(() => {
    const unsub = gameEvents.on("notify", ({ message, type = "info" }) => {
      const id = crypto.randomUUID();

      setList((prev) => [...prev, { id, message, type }]);

      // auto-remove after 3s
      setTimeout(() => {
        setList((prev) => prev.filter((n) => n.id !== id));
      }, 3000);
    });

    return () => unsub();
  }, []);

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none">
      {list.map((n) => (
        <div
          key={n.id}
          className={`
            pointer-events-auto
            px-4 py-2 rounded-lg shadow-lg border text-sm font-medium
            animate-slide-in
            ${
              n.type === "error"
                ? "bg-red-900/70 border-red-700 text-red-200"
                : n.type === "success"
                ? "bg-emerald-900/70 border-emerald-700 text-emerald-200"
                : "bg-[#0f141a]/80 border-gray-700 text-gray-200"
            }
          `}
        >
          {n.message}
        </div>
      ))}
    </div>
  );
}

/* Add Tailwind animations */
<style>{`
@keyframes slideIn {
  from { transform: translateX(40px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
.animate-slide-in {
  animation: slideIn 0.25s ease-out;
}
`}</style>
