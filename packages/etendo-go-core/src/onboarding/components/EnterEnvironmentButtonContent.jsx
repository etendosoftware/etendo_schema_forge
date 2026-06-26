import React from 'react';
import { Loader2, ChevronRight } from 'lucide-react';

export function EnterEnvironmentButtonContent({ isLoggingIn, label }) {
  if (isLoggingIn) {
    return <Loader2 className="h-4 w-4 animate-spin" data-testid="Loader2__79cf84" />;
  }

  return (
    <>
      {label} <ChevronRight className="h-4 w-4 ml-1" data-testid="ChevronRight__79cf84" />
    </>
  );
}

export default EnterEnvironmentButtonContent;
