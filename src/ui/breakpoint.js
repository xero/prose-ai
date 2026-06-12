//  ▓██▀█ ▓██▀█ ▓██▀█   ▓██▀█ ▓██▀█    ▓██▀█ ▀▀
//  ▒██▄█ ▒██▄▀ ▒██ █   ▒██   ▒██▄  █▒ ▒██▄█ ██░
//  ███   ███ █ ███▄█ █▄███   ███▄▄    ███ █ ██▒
//  breakpoint

// single source of truth for the layout breakpoint — keep in sync with
// the @media (width < 768px) blocks in index.html
export const mobile = window.matchMedia('(width < 768px)');
