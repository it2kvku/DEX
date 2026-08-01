"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

/** Toast phản hồi (copy địa chỉ, đổi mạng...) — spring vào từ đáy màn hình. */
export function Toast({ message }: { message: string | null }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 380, damping: 26 }}
          className="fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/[0.08] bg-zinc-950/80 px-4 py-2.5 text-sm text-white shadow-2xl backdrop-blur-xl"
          role="status"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
