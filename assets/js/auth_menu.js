// Auth Menu Logic
// Checks for authentication and toggles menu visibility

document.addEventListener('DOMContentLoaded', async () => {
    const API_URL = window.GO4U_API_URL;

    // Function to check if user is authenticated
    // We try to fetch the profile. If it succeeds, we are logged in.
    // If it fails (401), we are logged out.
    // Optimization: Check for cookie presence first if possible, but HttpOnly cookies can't be read by JS.
    // So we assume logged out until proven otherwise, OR we store a flag in localStorage on login.

    // Strategy: 
    // 1. Hide auth-dependent items initially (CSS or JS)
    // 2. Perform check
    // 3. Show correct items

    const loginItem = document.querySelector('.menu-item-login');
    const signupItem = document.querySelector('.menu-item-signup');
    const logoutItem = document.querySelector('.menu-item-logout');
    const adminItem = document.querySelector('.menu-item-admin');
    const dashboardItem = document.querySelector('.menu-item-dashboard');

    // Helper to toggle visibility
    const show = (el) => { if (el) el.style.display = 'inline-block'; };
    const hide = (el) => { if (el) el.style.display = 'none'; };

    // Initial state: hide everything to prevent flickering? 
    // Or assume logged out (show login/signup) and flip if logged in.
    // Let's assume logged out default.
    hide(logoutItem);
    hide(adminItem);
    hide(dashboardItem);
    show(loginItem);
    show(signupItem);

    try {
        // Quick check using an endpoint. 'profile' is good.
        // Or simpler: check if we just logged in via localStorage flag? 
        // Reliance on localStorage is weak if cookies persist but storage cleared.
        // Let's do a fetch. It might delay menu update slightly.
        const response = await fetch(`${API_URL}/profile`, {
            credentials: 'include'
        });

        if (response.ok) {
            const user = await response.json();
            // Logged In
            hide(loginItem);
            hide(signupItem);
            show(logoutItem);
            show(dashboardItem);

            if (user.Role === 'admin') {
                show(adminItem);
            }
        }
    } catch (e) {
        // Assume logged out or error
        console.log("Auth check failed or not logged in");
    }

    // Handle Logout Click
    if (logoutItem) {
        logoutItem.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                await fetch(`${API_URL}/logout`, { method: 'POST', credentials: 'include' });
                window.location.href = '/';
            } catch (e) {
                console.error("Logout failed", e);
                window.location.href = '/';
            }
        });
    }
});
