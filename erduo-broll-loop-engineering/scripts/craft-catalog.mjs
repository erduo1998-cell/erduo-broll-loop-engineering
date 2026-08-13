const ENTRY_FIELDS = Object.freeze([
  'id', 'category', 'intent', 'heroFrame', 'motionGrammar', 'materialPrerequisites',
  'compositionFamily', 'hyperframesLocator', 'remotionGuidance', 'fallback', 'evidenceLevel',
]);
const COMPOSITION_FAMILIES = new Set([
  'full-bleed-material', 'spatial-path-workflow', 'object-kinetic-type',
  'comparison-selection', 'desktop-instrument-board', 'data-diagram-evidence',
  'camera-depth-environment', 'sparse-hold-chapter-outro',
]);

function fail(message) {
  throw new Error(`craft catalog validation failed: ${message}`);
}

export function validateCraftCatalog(catalog) {
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) fail('root must be an object');
  const rootFields = Object.keys(catalog).toSorted();
  if (JSON.stringify(rootFields) !== JSON.stringify(['categories', 'entries', 'purpose', 'schemaVersion'])) fail('root fields are not closed');
  if (catalog.schemaVersion !== '1.0.0') fail('unsupported schemaVersion');
  if (typeof catalog.purpose !== 'string' || !catalog.purpose.trim()) fail('purpose is required');
  if (!Array.isArray(catalog.categories) || !catalog.categories.length
    || catalog.categories.some((item) => typeof item !== 'string' || !/^[a-z0-9][a-z0-9-]*$/u.test(item))
    || new Set(catalog.categories).size !== catalog.categories.length) fail('categories must be unique stable IDs');
  if (!Array.isArray(catalog.entries) || !catalog.entries.length) fail('entries are required');
  const categories = new Set(catalog.categories);
  const ids = new Set();
  const locators = new Set();
  const represented = new Set();
  for (const [index, entry] of catalog.entries.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
      || JSON.stringify(Object.keys(entry).toSorted()) !== JSON.stringify([...ENTRY_FIELDS].toSorted())) fail(`entry ${index} fields are not closed`);
    if (typeof entry.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/u.test(entry.id) || ids.has(entry.id)) fail(`entry ${index} has an invalid or duplicate id`);
    ids.add(entry.id);
    if (!categories.has(entry.category)) fail(`entry ${entry.id} has an unknown category`);
    represented.add(entry.category);
    for (const field of ['intent', 'heroFrame', 'motionGrammar', 'hyperframesLocator', 'remotionGuidance', 'fallback']) {
      if (typeof entry[field] !== 'string' || !entry[field].trim()) fail(`entry ${entry.id} has invalid ${field}`);
    }
    if (locators.has(entry.hyperframesLocator)) fail(`entry ${entry.id} has a duplicate hyperframesLocator`);
    locators.add(entry.hyperframesLocator);
    if (!Array.isArray(entry.materialPrerequisites)
      || entry.materialPrerequisites.some((item) => typeof item !== 'string' || !item.trim())) fail(`entry ${entry.id} has invalid materialPrerequisites`);
    if (!COMPOSITION_FAMILIES.has(entry.compositionFamily)) fail(`entry ${entry.id} has an unknown compositionFamily`);
    if (entry.evidenceLevel !== 'runtime-neutral-guidance') fail(`entry ${entry.id} has an unsupported evidenceLevel`);
  }
  if (represented.size !== categories.size || [...categories].some((category) => !represented.has(category))) fail('every category must contain at least one entry');
  return { entriesById: new Map(catalog.entries.map((entry) => [entry.id, entry])) };
}
