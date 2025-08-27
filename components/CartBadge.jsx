// components/CartBadge.jsx
import { useState, useEffect } from "react";

export default function CartBadge({
  count = 0,
  position = "top-4 right-4",
  bounce = true,
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(count > 0);
  }, [count]);

  return (
    <div className={`absolute ${position} z-50`}>
      {visible && (
        <div
          className={`bg-pink-500 text-white rounded-full px-3 py-1 text-sm font-semibold shadow-lg ${
            bounce ? "animate-bounce" : ""
          }`}
        >
          🛍️ {count}
        </div>
      )}
    </div>
  );
}
