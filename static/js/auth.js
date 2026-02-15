// Use dynamic API URL based on environment (set in baseof.html)
// Falls back to localhost for development if not set
const API_BASE = window.GO4U_API_URL || 'http://localhost:8080';

const auth = {
    // --- STATE ---
    token: null,
    user: null,

    // --- INIT ---
    init() {
        this.fetchProfile();

        // Attach Logout Handler if element exists
        // Note: The element might be dynamically shown/hidden, so we might need event delegation
        // or re-attach in updateUI. 
        // Better: Use global click handler for logout button
        document.addEventListener('click', (e) => {
            if (e.target && (e.target.id === 'logout-btn' || e.target.closest('.menu-item-logout'))) {
                e.preventDefault();
                this.logout();
            }
        });
    },

    // --- API CALLS ---

    async login(username, password) {
        try {
            const response = await fetch(`${API_BASE}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ username, password })
            });

            if (!response.ok) {
                const err = await response.json();
                if (response.status === 401 && err.message === "2FA Required") {
                    return { requires2FA: true };
                }
                throw new Error(err.message || 'Login failed');
            }

            const data = await response.json();
            this.fetchProfile();
            return { success: true };
        } catch (error) {
            console.error('Login Error:', error);
            return { error: error.message };
        }
    },

    async loginWith2FA(username, password, pin) {
        try {
            const response = await fetch(`${API_BASE}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ username, password, pin })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || '2FA Validation failed');
            }

            this.fetchProfile();
            return { success: true };
        } catch (error) {
            return { error: error.message };
        }
    },

    async requestMagicLink(email) {
        try {
            const response = await fetch(`${API_BASE}/login/magic-link`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || 'Failed to send link');
            }

            return { success: true, message: "Magic link sent!" };
        } catch (error) {
            return { error: error.message };
        }
    },

    async signup(data) {
        try {
            const response = await fetch(`${API_BASE}/new_user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include', // Ensure session created if auto-login
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || 'Signup failed');
            }

            return { success: true };
        } catch (error) {
            return { error: error.message };
        }
    },

    async logout() {
        try {
            await fetch(`${API_BASE}/logout`, { method: 'POST', credentials: 'include' });
        } catch (e) {
            console.error("Logout failed on server:", e);
        }
        this.user = null;
        this.updateUI();
        window.location.href = '/';
    },

    async fetchProfile() {
        try {
            const response = await fetch(`${API_BASE}/profile/me`, {
                method: 'GET',
                credentials: 'include'
            });

            if (response.ok) {
                this.user = await response.json();
                this.updateUI();
            } else {
                this.user = null;
                this.updateUI();
            }
        } catch (e) {
            this.user = null;
            this.updateUI();
        }
    },

    async updateProfile(bio, status) {
        try {
            const response = await fetch(`${API_BASE}/profile/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ bio, status })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || 'Update failed');
            }

            if (this.user) {
                this.user.bio = bio;
                this.user.status = status;
            }
            return { success: true };
        } catch (error) {
            return { error: error.message };
        }
    },

    // --- UI UPDATES ---
    updateUI() {
        console.log('Auth: Updating UI. User:', this.user); // Debug

        const loginBtn = document.getElementById('nav-login-btn');
        const profileBtn = document.getElementById('nav-profile-btn');

        // Robust Selection: Try class first, fallback to attribute (if needed)
        const menuLogin = document.querySelectorAll('.menu-item-login');
        const menuSignup = document.querySelectorAll('.menu-item-signup');
        const menuLogout = document.querySelectorAll('.menu-item-logout');
        const menuAddPost = document.querySelectorAll('.menu-item-add-post');
        const menuAdmin = document.querySelectorAll('.menu-item-admin');
        const menuDashboard = document.querySelectorAll('.menu-item-dashboard');

        // Fast logic to prevent flicker (though best done in CSS with auth-loading class)
        if (this.user) {
            // Logged In
            if (loginBtn) loginBtn.style.display = 'none';
            if (profileBtn) {
                profileBtn.style.display = 'inline-block';
                profileBtn.innerText = this.user.avatar_name;
                profileBtn.href = `/u/${this.user.avatar_name}`;
            }

            menuLogin.forEach(el => el.style.display = 'none');
            menuSignup.forEach(el => el.style.display = 'none');

            // Show logical items
            menuLogout.forEach(el => el.style.display = 'inline-block');
            menuAddPost.forEach(el => el.style.display = 'inline-block');
            menuDashboard.forEach(el => el.style.display = 'inline-block');

            // Admin Only
            if (this.user.role === 'admin') {
                menuAdmin.forEach(el => el.style.display = 'inline-block');
            } else {
                menuAdmin.forEach(el => el.style.display = 'none');
            }

        } else {
            // Logged Out
            if (loginBtn) loginBtn.style.display = 'inline-block';
            if (profileBtn) profileBtn.style.display = 'none';

            menuLogin.forEach(el => el.style.display = 'inline-block');
            menuSignup.forEach(el => el.style.display = 'inline-block');

            // Hide protected items
            menuLogout.forEach(el => el.style.display = 'none');
            menuAddPost.forEach(el => el.style.display = 'none');
            menuDashboard.forEach(el => el.style.display = 'none');
            menuAdmin.forEach(el => el.style.display = 'none');
        }

        window.dispatchEvent(new CustomEvent('auth:state-changed', { detail: this.user }));
    }
};

document.addEventListener('DOMContentLoaded', () => {
    auth.init();
    window.auth = auth;
});
