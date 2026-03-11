import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useInspector } from '@/components/inspector/InspectorProvider.jsx';

export default function WindowLoader({ windowMap, apiBaseUrl }) {
  const { windowName, recordId } = useParams();
  const { token } = useAuth();
  const inspector = useInspector();
  const [Component, setComponent] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setComponent(null);

    const windowConfig = windowMap[windowName];
    if (!windowConfig) {
      setError(`Window "${windowName}" not found`);
      setLoading(false);
      return;
    }

    windowConfig.loader()
      .then(mod => {
        setComponent(() => mod.default);
        setLoading(false);
      })
      .catch(err => {
        setError(`Failed to load window "${windowName}": ${err.message}`);
        setLoading(false);
      });
  }, [windowName, windowMap]);

  useEffect(() => {
    if (windowName) {
      inspector.loadSchema(windowName).catch(() => {
        // Schema may not exist for all windows — that's OK
      });
    }
  }, [windowName]);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-destructive font-medium">{error}</p>
          <p className="text-sm text-muted-foreground mt-2">Check that the component has been generated.</p>
        </div>
      </div>
    );
  }

  if (!Component) return null;

  return (
    <Component
      token={token}
      apiBaseUrl={apiBaseUrl}
      window={windowMap[windowName]}
      windowName={windowName}
      recordId={recordId}
    />
  );
}
