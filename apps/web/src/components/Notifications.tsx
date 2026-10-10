import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Tone = "info" | "error";
interface Notice {
  id: number;
  tone: Tone;
  message: string;
}

const NotifyContext = createContext<(tone: Tone, message: string) => void>(() => {});

// eslint-disable-next-line react-refresh/only-export-components
export const useNotify = () => useContext(NotifyContext);

let nextId = 0;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);

  const notify = useCallback((tone: Tone, message: string) => {
    const id = nextId++;
    setNotices((n) => [...n, { id, tone, message }]);
    setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), 6000);
  }, []);

  return (
    <NotifyContext.Provider value={notify}>
      {children}
      <div aria-live="polite" className="fixed right-4 bottom-4 z-50 flex flex-col gap-2">
        {notices.map((n) => (
          <div
            key={n.id}
            className={`bg-raised rounded-md border px-4 py-2 text-sm shadow-[0_8px_24px_rgb(0_0_0/0.5)] ${
              n.tone === "error" ? "border-critical/60" : "border-line"
            }`}
          >
            {n.message}
          </div>
        ))}
      </div>
    </NotifyContext.Provider>
  );
}
