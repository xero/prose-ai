//  ▓██▀█ ▓██▀█ ▓██▀█   ▓██▀█ ▓██▀█    ▓██▀█ ▀▀
//  ▒██▄█ ▒██▄▀ ▒██ █   ▒██   ▒██▄  █▒ ▒██▄█ ██░
//  ███   ███ █ ███▄█ █▄███   ███▄▄    ███ █ ██▒
//  main entry

import { editor }          from './editor.js';
import { watchSuggestions, notifySuggestions } from './state/suggestions.js';
import { initToolbar }     from './ui/toolbar.js';
import { initSidebar }     from './ui/sidebar.js';
import { initTooltip }     from './ui/tooltip.js';
import { initBubbleMenu }  from './ui/bubble-menu/index.js';
import { initResizer }     from './ui/resizer.js';
import { initSheet }       from './ui/sheet.js';
import { initTheme }       from './ui/theme.js';

// hook into tiptap transactions so sidebar stays in sync
// when marks are removed by accept/reject or user edits
watchSuggestions(editor);

initToolbar(editor);
initSidebar(editor);
initTooltip(editor);
initBubbleMenu(editor);
initResizer();
initSheet();
initTheme();

// suggestions persist with the document — surface any restored from the
// last session now that every panel is listening
notifySuggestions(editor);

// exposed for browser-automation debugging (playwright drives accept/reject
// and inspects marks through this)
/** @type {any} */ (window).__editor = editor;
