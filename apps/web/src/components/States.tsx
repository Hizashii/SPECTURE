import { ApiClientError } from "../lib/api";
import { Button, Skeleton } from "./ui";

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiClientError ? error.message : "Something went wrong.";
  return (
    <div role="alert" className="border-critical/40 bg-critical/10 rounded-md border p-4 text-sm">
      <p className="text-critical font-medium">{message}</p>
      {error instanceof ApiClientError && (
        <p className="text-ink-2 mt-1 font-mono text-xs">{error.code}</p>
      )}
      {onRetry && (
        <Button className="mt-3" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function LoadingRows({ label = "Loading…", rows = 4 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-label={label} className="space-y-2 p-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-8" />
      ))}
    </div>
  );
}
