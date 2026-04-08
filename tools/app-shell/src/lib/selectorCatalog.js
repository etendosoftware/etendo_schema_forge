export function getSelectorCatalogKeys(entityName, field = {}) {
  const keys = [];

  if (entityName && field.column) keys.push(`${entityName}:${field.column}`);
  if (entityName && field.key) keys.push(`${entityName}:${field.key}`);
  if (entityName && field.field) keys.push(`${entityName}:${field.field}`);
  if (field.reference) keys.push(field.reference);

  return [...new Set(keys.filter(Boolean))];
}

export function getCatalogOptions(catalogs, entityName, field = {}) {
  for (const key of getSelectorCatalogKeys(entityName, field)) {
    const options = catalogs?.[key];
    if (Array.isArray(options)) return options;
  }

  return [];
}
