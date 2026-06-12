//  ▓██▀█ ▓██▀█ ▓██▀█   ▓██▀█ ▓██▀█    ▓██▀█ ▀▀
//  ▒██▄█ ▒██▄▀ ▒██ █   ▒██   ▒██▄  █▒ ▒██▄█ ██░
//  ███   ███ █ ███▄█ █▄███   ███▄▄    ███ █ ██▒
//  theme toggle

// light is the stylesheet default; .dark on <html> flips the palette.
// initial state is set pre-paint by the inline script in index.html:
// a stored choice wins, OS preference is the fallback. the button
// toggles and persists the choice.

const html = document.documentElement;

const STORAGE_KEY = 'prose-ai:theme';

// toolbar surface per theme — what the browser chrome tints to
const SURFACE = { dark: '#161614', light: '#efebdf' };

export const initTheme = () => {
	const btn   = document.querySelector('#btn-theme');
	const label = document.querySelector('#theme-label');
	const meta  = document.querySelector('meta[name="theme-color"]');

	const sync = () => {
		const isDark = html.classList.contains('dark');
		btn.setAttribute('aria-pressed', String(isDark));
		meta.setAttribute('content', isDark ? SURFACE.dark : SURFACE.light);
		label.textContent = isDark ? 'night' : 'light';
	};

	// the cross-fade class lives only as long as the fade itself
	let shiftTimer = null;
	btn.addEventListener('click', () => {
		html.classList.add('theme-shift');
		html.classList.toggle('dark');
		localStorage.setItem(STORAGE_KEY, html.classList.contains('dark') ? 'dark' : 'light');
		sync();
		// fade duration + a beat — keep in sync with .theme-shift in style.css
		clearTimeout(shiftTimer);
		shiftTimer = setTimeout(() => html.classList.remove('theme-shift'), 700);
	});

	sync();
};
