// ╔═══════════════════════════════╗
// ║   prose-ai — main entry       ║
// ╚═══════════════════════════════╝

import { editor }          from './editor.js';
import { watchSuggestions } from './state/suggestions.js';
import { initToolbar }     from './ui/toolbar.js';
import { initSidebar }     from './ui/sidebar.js';
import { initTooltip }     from './ui/tooltip.js';
import { initBubbleMenu }  from './ui/bubble-menu/index.js';
import { initResizer }     from './ui/resizer.js';
import { initSheet }       from './ui/sheet.js';

// hook into tiptap transactions so sidebar stays in sync
// when marks are removed by accept/reject or user edits
watchSuggestions(editor);

initToolbar(editor);
initSidebar(editor);
initTooltip(editor);
initBubbleMenu(editor);
initResizer();
initSheet();

// exposed for browser-automation debugging (playwright drives accept/reject
// and inspects marks through this)
window.__editor = editor;
