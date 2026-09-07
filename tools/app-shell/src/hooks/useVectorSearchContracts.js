import { useEffect, useState } from 'react';

const windowContractLoaders = Object.entries(import.meta.glob('@generated/*/contract.json'));

function specNameFromContractPath(path) {
  return path.split('/').at(-2);
}

/** Loads the generated search contracts shared by the top bar and palette. */
export function useVectorSearchContracts(enabled = true) {
  const [contracts, setContracts] = useState([]);

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    Promise.all(windowContractLoaders.map(async ([path, loadContract]) => ({
      contract: await loadContract(),
      specName: specNameFromContractPath(path),
    })))
      .then((loaded) => {
        if (active) setContracts(loaded);
      })
      .catch(() => {
        if (active) setContracts([]);
      });
    return () => { active = false; };
  }, [enabled]);

  return contracts;
}
