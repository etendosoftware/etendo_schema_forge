import { Card, CardContent } from '@/components/ui/card';

/**
 * Shared centered shell for loading/error/access status states.
 *
 * Keeping the wrapper in one component avoids each page growing a subtly different copy of the
 * same card layout while leaving the inner message and actions page-specific.
 */
export default function StatusCard({ testId, className = '', children }) {
  return (
    <Card data-testid={testId}>
      <CardContent
        className={`flex flex-col items-center justify-center text-center ${className}`}
        data-testid="StatusCard__content"
      >
        {children}
      </CardContent>
    </Card>
  );
}
