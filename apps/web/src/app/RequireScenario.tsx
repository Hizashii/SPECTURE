import { FolderOpen } from "lucide-react";
import { Outlet } from "react-router";

import { ErrorState, LoadingRows } from "../components/States";
import { EmptyState } from "../components/ui";
import { useActiveScenario } from "../features/scenarios/ScenarioProvider";

/** Routes that need a scenario render only once one is loaded, so none can spin forever. */
export function RequireScenario() {
  const { list, selectedId } = useActiveScenario();
  if (list.isPending) return <LoadingRows label="Loading scenarios…" />;
  if (list.error) {
    return (
      <div className="p-6">
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      </div>
    );
  }
  if (!selectedId) {
    return (
      <EmptyState icon={FolderOpen} title="No scenarios available">
        <p>
          The API returned no valid scenarios. Add a scenario under <code>scenarios/</code> or check
          the Scenarios page for validation errors.
        </p>
      </EmptyState>
    );
  }
  return <Outlet />;
}
