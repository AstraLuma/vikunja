import {common, createLowlight} from 'lowlight'

// Shared by every editor instance: a task with many comments mounts one editor per comment,
// and registering all grammars for each of them wastes memory on low-end phones.
export const lowlight = createLowlight(common)
