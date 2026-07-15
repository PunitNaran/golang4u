/* golang4u UI Enhancements - Trust Chain, Dark Mode, Toasts */

(function() {
    'use strict';

    // ============================================================
    // DARK MODE TOGGLE
    // ============================================================
    const THEME_KEY = 'go4u-theme';

    function getTheme() {
        return localStorage.getItem(THEME_KEY) || 'auto';
    }

    function setTheme(theme) {
        localStorage.setItem(THEME_KEY, theme);
        document.body.setAttribute('data-theme', theme);

        if (theme === 'dark' || theme === 'black') {
            document.documentElement.setAttribute('theme', 'dark');
        } else {
            document.documentElement.removeAttribute('theme');
        }
    }

    function initTheme() {
        const theme = getTheme();

        if (theme === 'auto') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            setTheme(prefersDark ? 'dark' : 'light');

            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                setTheme(e.matches ? 'dark' : 'light');
            });
        } else {
            setTheme(theme);
        }

        // Update select dropdowns
        const desktopSelect = document.getElementById('theme-select-desktop');
        const mobileSelect = document.getElementById('theme-select-mobile');
        if (desktopSelect) desktopSelect.value = theme;
        if (mobileSelect) mobileSelect.value = theme;

        // Update icon
        const themeIcons = document.querySelectorAll('.theme-switch i, #mobile-theme-toggle i');
        themeIcons.forEach(icon => {
            if (theme === 'dark' || theme === 'black') {
                icon.className = 'fas fa-sun fa-fw';
            } else {
                icon.className = 'fas fa-moon fa-fw';
            }
        });
    }

    function toggleTheme() {
        const current = getTheme();
        const next = current === 'dark' || current === 'black' ? 'light' : 'dark';
        setTheme(next);

        // Update select dropdowns
        const desktopSelect = document.getElementById('theme-select-desktop');
        const mobileSelect = document.getElementById('theme-select-mobile');
        if (desktopSelect) desktopSelect.value = next;
        if (mobileSelect) mobileSelect.value = next;

        // Update icon
        const themeIcons = document.querySelectorAll('.theme-switch i, #mobile-theme-toggle i');
        themeIcons.forEach(icon => {
            icon.className = next === 'dark' || next === 'black' ? 'fas fa-sun fa-fw' : 'fas fa-moon fa-fw';
        });

        showToast(next === 'dark' ? 'Dark mode enabled' : 'Light mode enabled', 'success');
    }

    // ============================================================
    // TOAST NOTIFICATIONS
    // ============================================================
    function showToast(message, type = 'success', duration = 4000) {
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            container.setAttribute('aria-live', 'polite');
            container.setAttribute('aria-label', 'Notifications');
            document.body.appendChild(container);
        }

        const icons = {
            success: 'fa-check-circle',
            warning: 'fa-exclamation-triangle',
            error: 'fa-times-circle'
        };

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <span class="toast-icon"><i class="fas ${icons[type] || icons.success}"></i></span>
            <div class="toast-content">
                <div class="toast-title">${type === 'success' ? 'Success' : type === 'warning' ? 'Warning' : 'Error'}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close" aria-label="Close notification">&times;</button>
        `;

        container.appendChild(toast);

        // Close button handler
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            toast.classList.add('toast-exit');
            setTimeout(() => toast.remove(), 250);
        });

        // Auto-remove
        setTimeout(() => {
            if (toast.parentNode) {
                toast.classList.add('toast-exit');
                setTimeout(() => toast.remove(), 250);
            }
        }, duration);
    }

    // ============================================================
    // SKIP TO CONTENT (Accessibility)
    // ============================================================
    function initSkipToContent() {
        const skipLink = document.createElement('a');
        skipLink.href = '#main-content';
        skipLink.className = 'skip-to-content';
        skipLink.textContent = 'Skip to main content';
        skipLink.style.cssText = `
            position: absolute;
            top: -40px;
            left: 0;
            background: #6366f1;
            color: white;
            padding: 0.5rem 1rem;
            z-index: 100000;
            transition: top 0.2s ease;
            text-decoration: none;
            font-weight: 600;
        `;
        skipLink.addEventListener('focus', () => { skipLink.style.top = '0'; });
        skipLink.addEventListener('blur', () => { skipLink.style.top = '-40px'; });
        document.body.insertBefore(skipLink, document.body.firstChild);
    }

    // ============================================================
    // TRUST SCORE DYNAMIC UPDATE
    // ============================================================
    function updateTrustBadge() {
        const badge = document.getElementById('trust-badge');
        const scoreValue = document.getElementById('trust-score-value');
        const flag = document.getElementById('bad-actor-flag');

        if (!badge) return;

        const level = badge.getAttribute('data-trust-level');

        // Remove all level classes
        badge.classList.remove('trust-high', 'trust-medium', 'trust-low');

        // Add appropriate class
        if (level === 'high') {
            badge.classList.add('trust-high');
        } else if (level === 'medium') {
            badge.classList.add('trust-medium');
        } else {
            badge.classList.add('trust-low');
        }

        // Update ARIA label
        badge.setAttribute('aria-label', `Trust level: ${level}`);
    }

    // ============================================================
    // MOBILE MENU TOGGLE
    // ============================================================
    function initMobileMenu() {
        const toggle = document.getElementById('menu-toggle-mobile');
        const menu = document.getElementById('menu-mobile');

        if (toggle && menu) {
            toggle.addEventListener('click', () => {
                toggle.classList.toggle('active');
                menu.classList.toggle('open');
                const isOpen = menu.classList.contains('open');

                toggle.setAttribute('aria-expanded', isOpen);
                toggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
            });

            // Close on outside click
            document.addEventListener('click', (e) => {
                if (!toggle.contains(e.target) && !menu.contains(e.target)) {
                    toggle.classList.remove('active');
                    menu.classList.remove('open');
                    toggle.setAttribute('aria-expanded', 'false');
                }
            });
        }
    }

    // ============================================================
    // SEARCH TOGGLE
    // ============================================================
    function initSearch() {
        const desktopToggle = document.getElementById('search-toggle-desktop');
        const mobileToggle = document.getElementById('search-toggle-mobile');

        if (desktopToggle) {
            desktopToggle.addEventListener('click', () => {
                const input = document.getElementById('search-input-desktop');
                if (input) input.focus();
            });
        }

        if (mobileToggle) {
            mobileToggle.addEventListener('click', () => {
                const input = document.getElementById('search-input-mobile');
                if (input) input.focus();
            });
        }
    }

    // ============================================================
    // INITIALIZATION
    // ============================================================
    function init() {
        initTheme();
        initSkipToContent();
        initMobileMenu();
        initSearch();

        // Theme switch buttons
        document.querySelectorAll('.theme-switch').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                toggleTheme();
            });
        });

        // Theme select dropdowns
        const desktopSelect = document.getElementById('theme-select-desktop');
        const mobileSelect = document.getElementById('theme-select-mobile');

        if (desktopSelect) {
            desktopSelect.addEventListener('change', (e) => {
                setTheme(e.target.value);
                showToast('Theme changed', 'success', 2000);
            });
        }

        if (mobileSelect) {
            mobileSelect.addEventListener('change', (e) => {
                setTheme(e.target.value);
                showToast('Theme changed', 'success', 2000);
            showToast('Theme changed', 'success', 2000);
        });
        }

        // Mobile theme toggle button
        const mobileThemeToggle = document.getElementById('mobile-theme-toggle');
        if (mobileThemeToggle) {
            mobileThemeToggle.addEventListener('click', toggleTheme);
        }

        // Trust score updates on DOM ready
        if (typeof updateTrustBadge === 'function') {
            updateTrustBadge();
        }
    }

    // Run on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose to global scope
    window.go4u = window.go4u || {};
    window.go4u.showToast = showToast;
    window.go4u.toggleTheme = toggleTheme;
    window.go4u.getTheme = getTheme;
    window.go4u.setTheme = setTheme;
})();
