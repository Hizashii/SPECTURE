import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { NotificationProvider } from "../components/Notifications";
import { ScenarioProvider } from "../features/scenarios/ScenarioProvider";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <NotificationProvider>
        <ScenarioProvider>{children}</ScenarioProvider>
      </NotificationProvider>
    </QueryClientProvider>
  );
}
