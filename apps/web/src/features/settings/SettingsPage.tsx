import { ErrorState, LoadingRows } from "../../components/States";
import { PageHeader, Panel, KeyValue, IdTag } from "../../components/ui";
import { useCapabilities, useHealth } from "../../lib/queries";

export function SettingsPage() {
  const health = useHealth();
  const caps = useCapabilities();

  return (
    <>
      <PageHeader
        title="Settings"
        description="Connection and engine information. Nothing here is configurable yet."
      />
      <Panel title="Connection" className="max-w-2xl">
        {(health.isPending || caps.isPending) && <LoadingRows rows={3} />}
        {(health.error ?? caps.error) && (
          <ErrorState
            error={health.error ?? caps.error}
            onRetry={() => {
              void health.refetch();
              void caps.refetch();
            }}
          />
        )}
        {health.data && caps.data && (
          <KeyValue
            items={[
              ["API status", health.data.status],
              ["API version", <IdTag key="v">{health.data.version}</IdTag>],
              ["Engine version", caps.data.engine_version ?? "None (engine not implemented)"],
              [
                "Scenario schema",
                <IdTag key="s">{caps.data.scenario_schema_versions.join(", ")}</IdTag>,
              ],
              ["Endpoint", <IdTag key="e">/api/v1</IdTag>],
            ]}
          />
        )}
      </Panel>
    </>
  );
}
