import { cn } from '@/lib/utils';

export default function ResponseViewer({ response }) {
  if (!response) {
    return (
      <div className="flex items-center justify-center h-48 text-inverse-muted text-sm">
        Send a request to see the response
      </div>
    );
  }

  const { status, statusText, elapsed, body } = response;

  const statusColor =
    status >= 200 && status < 300 ? 'text-status-success-foreground' :
    status >= 400 && status < 500 ? 'text-status-warning-foreground' :
    status >= 500 ? 'text-destructive' :
    'text-inverse-muted';

  const formatted = typeof body === 'object' ? JSON.stringify(body, null, 2) : String(body);

  return (
    <div className="flex flex-col gap-2">
      {/* Status bar */}
      <div className="flex items-center gap-3 px-3 py-2 bg-inverse-muted rounded border border-inverse-border">
        <span className={cn('font-mono font-bold text-sm', statusColor)}>
          {status}
        </span>
        <span className="text-xs text-inverse-muted">{statusText}</span>
        <span className="ml-auto text-xs text-inverse-muted">{elapsed}ms</span>
      </div>

      {/* Response body */}
      <div className="relative">
        <pre className="bg-inverse border border-inverse-border rounded p-3 overflow-auto max-h-[500px] text-xs font-mono text-inverse-foreground leading-relaxed">
          {formatted}
        </pre>
      </div>
    </div>
  );
}
