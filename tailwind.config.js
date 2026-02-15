/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./layouts/**/*.html",
        "./content/**/*.{html,md}",
        "./static/**/*.html",
        "./assets/**/*.js"
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                primary: '#6366f1',
                secondary: '#a855f7',
            }
        },
    },
    plugins: [],
}
