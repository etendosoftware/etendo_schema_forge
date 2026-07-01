import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useSpecDetail } from './useDiscovery';
import SpecList from './SpecList';
import AddSpec from './AddSpec';
import EntityPanel from './EntityPanel';
import RequestBuilder from './RequestBuilder';
import ResponseViewer from './ResponseViewer';
import SpecManager from './SpecManager';

export default function ExplorerPage() {
  const [searchParams] = useSearchParams();
  const specFromUrl = searchParams.get('spec');
  const [selectedSpec, setSelectedSpec] = useState(specFromUrl);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [response, setResponse] = useState(null);
  const [mode, setMode] = useState('test'); // 'test' or 'manage'
  const [specListKey, setSpecListKey] = useState(0);

  const { spec: specDetail, refresh: refreshSpec } = useSpecDetail(selectedSpec);

  useEffect(() => {
    if (specFromUrl && specFromUrl !== selectedSpec) {
      setSelectedSpec(specFromUrl);
      setSelectedEntity(null);
      setResponse(null);
    }
  }, [specFromUrl]);

  const handleSelectSpec = (specName) => {
    setSelectedSpec(specName);
    setSelectedEntity(null);
    setResponse(null);
  };

  const refreshAll = () => {
    setSpecListKey(k => k + 1);
    refreshSpec();
  };

  return (
    <div className="flex h-full bg-zinc-950">
      {/* Left: Spec list + Add */}
      <div className="w-56 border-r border-zinc-800 flex-shrink-0 flex flex-col">
        <div className="px-3 py-3 border-b border-zinc-800">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            NEO Explorer
          </h2>
          {/* Mode toggle */}
          <div className="flex gap-1 mt-2">
            <button
              onClick={() => setMode('test')}
              className={cn(
                'flex-1 px-2 py-1 rounded text-[10px] font-medium transition-colors',
                mode === 'test' ? 'bg-green-600/20 text-green-400' : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              Test
            </button>
            <button
              onClick={() => setMode('manage')}
              className={cn(
                'flex-1 px-2 py-1 rounded text-[10px] font-medium transition-colors',
                mode === 'manage' ? 'bg-blue-600/20 text-blue-400' : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              Manage
            </button>
          </div>
        </div>

        {mode === 'manage' && <AddSpec onCreated={refreshAll} data-testid="AddSpec__58b8a2" />}

        <div className="flex-1 overflow-y-auto">
          <SpecList
            key={specListKey}
            selected={selectedSpec}
            onSelect={handleSelectSpec}
            useAdmin={mode === 'manage'}
            data-testid="SpecList__58b8a2" />
        </div>
      </div>
      {/* Right: depends on mode */}
      {mode === 'test' ? (
        <>
          {/* Center: Entity panel */}
          <div className="w-64 border-r border-zinc-800 flex-shrink-0">
            <EntityPanel
              specName={selectedSpec}
              selectedEntity={selectedEntity}
              onSelectEntity={setSelectedEntity}
              data-testid="EntityPanel__58b8a2" />
          </div>

          {/* Right: Request + Response */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-zinc-800">
              <RequestBuilder
                specName={selectedSpec}
                entity={selectedEntity}
                onResponse={setResponse}
                data-testid="RequestBuilder__58b8a2" />
            </div>
            <div className="flex-1 overflow-auto p-4">
              <ResponseViewer response={response} data-testid="ResponseViewer__58b8a2" />
            </div>
          </div>
        </>
      ) : (
        /* Manage mode: full-width spec manager */
        (<div className="flex-1 overflow-hidden">
          <SpecManager
            spec={specDetail}
            onRefresh={refreshAll}
            data-testid="SpecManager__58b8a2" />
        </div>)
      )}
    </div>
  );
}
