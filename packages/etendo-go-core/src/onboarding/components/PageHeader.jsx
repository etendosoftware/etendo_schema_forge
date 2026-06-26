import React from 'react';
import { Button } from '@etendosoftware/app-shell-core/components/ui/button';

export function PageHeader({ accountName, onLogout, isAuthenticated, logoutLabel, brandLabel }) {
  return (
    <header className="bg-white border-b border-gray-100 px-6 py-4">
      <div className="max-w-2xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-amber-400 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">E</span>
          </div>
          <span className="font-semibold text-gray-900">{brandLabel}</span>
        </div>
        {isAuthenticated && accountName && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{accountName}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onLogout}
              className="text-gray-500 hover:text-gray-700"
              data-testid="Button__79cf84">
              {logoutLabel}
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}

export default PageHeader;
