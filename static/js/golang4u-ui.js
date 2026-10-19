/* golang4u UI Enhancements - Trust Chain, Dark Mode, Toasts, Mobile Nav */

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
    const Toast = {
        container: null,

        init() {
            this.container = document.getElementById('toast-container');
            if (!this.container) {
                console.warn('Toast: toast-container not found');
                return;
            }
        },

        show(message, type = 'success', title = null, duration = 4000) {
            if (!this.container) this.init();
            if (!this.container) return;

            const icons = {
                success: 'fa-check-circle',
                warning: 'fa-exclamation-triangle',
                error: 'fa-times-circle'
            };

            const titles = {
                success: title || 'Success',
                warning: title || 'Warning',
                error: title || 'Error'
            };

            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.setAttribute('role', 'alert');
            toast.innerHTML = `
                <i class="fas ${icons[type] || icons.success} toast-icon" aria-hidden="true"></i>
                <div class="toast-content">
                    <div class="toast-title">${titles[type]}</div>
                    <div class="toast-message">${message}</div>
                </div>
                <button class="toast-close" aria-label="Close notification">&times;</button>
            `;

            // Close button handler
            const closeBtn = toast.querySelector('.toast-close');
            closeBtn.addEventListener('click', () => this.dismiss(toast));

            this.container.appendChild(toast);

            // Auto-dismiss
            if (duration > 0) {
                setTimeout(() => this.dismiss(toast), duration);
            }

            return toast;
        },

        dismiss(toast) {
            if (!toast || !toast.parentNode) return;
            toast.classList.add('toast-exit');
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 250);
        }
    };

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
    // TRUST CHAIN API INTEGRATION
    // ============================================================
    const TrustChain = {
        API_BASE: window.GO4U_API_URL || 'http://localhost:8080',

        init() {
            this.loadTrustData();
        },

        async loadTrustData() {
            try {
                const response = await fetch(`${this.API_BASE}/trust-chain/me`, {
                    credentials: 'include',
                    headers: { 'Accept': 'application/json' }
                });

                if (response.ok) {
                    const data = await response.json();
                    this.updateUI(data);
                } else {
                    console.debug('TrustChain: Trust endpoint unavailable, using defaults');
                }
            } catch (e) {
                console.debug('TrustChain: Trust fetch failed, using defaults', e);
            }
        },

        updateUI(data) {
            const badge = document.getElementById('trust-badge');
            const scoreEl = document.getElementById('trust-score-value');
            const referralChain = document.getElementById('referral-chain');
            const badActorBadge = document.getElementById('bad-actor-badge');
            const badActorFlag = document.getElementById('bad-actor-flag');

            if (!data) return;

            if (badge && data.trust_level) {
                const level = data.trust_level.toLowerCase();
                badge.className = `trust-badge trust-${level}`;
                badge.setAttribute('data-trust-level', level);
                const textEl = badge.querySelector('.trust-badge-text');
                if (textEl) textEl.textContent = level.charAt(0).toUpperCase() + level.slice(1);
                badge.setAttribute('aria-label', `Trust level: ${level}`);
            }

            if (scoreEl && data.trust_score) {
                scoreEl.textContent = `${data.trust_score}/100`;
            }

            if (referralChain && data.referrals && Array.isArray(data.referrals) && data.referrals.length > 0) {
                referralChain.innerHTML = '';
                data.referrals.forEach((ref, i) => {
                    const item = document.createElement('span');
                    item.className = 'referral-chain-item';
                    item.setAttribute('data-index', i);
                    if (i > 0) {
                        item.innerHTML = `<i class="fas fa-chevron-right chain-arrow" aria-hidden="true"></i>`;
                        referralChain.appendChild(item);
                    }
                    const nameEl = document.createElement('span');
                    nameEl.className = 'referral-name';
                    nameEl.textContent = ref.name || ref.username || ref;
                    referralChain.appendChild(nameEl);
                });
            }

            if (data.flagged || data.bad_actor) {
                if (badActorBadge) badActorBadge.style.display = 'none';
                if (badActorFlag) {
                    badActorFlag.style.display = 'inline-flex';
                    badActorFlag.setAttribute('role', 'alert');
                    badActorFlag.setAttribute('aria-live', 'polite');
                }
            } else {
                if (badActorFlag) badActorFlag.style.display = 'none';
                if (badActorBadge) badActorBadge.style.display = 'inline-flex';
            }
        }
    };

    // ============================================================
    // MOBILE MENU TOGGLE
    // ============================================================
    function initMobileMenu() {
        const toggle = document.getElementById('menu-toggle-mobile');
        const menu = document.getElementById('menu-mobile');

        if (toggle && menu) {
            toggle.addEventListener('click', () => {
                const isOpen = menu.classList.toggle('open');
                toggle.classList.toggle('active');
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

            // Close menu on ESC key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && menu.classList.contains('open')) {
                    menu.classList.remove('open');
                    toggle.classList.remove('active');
                    toggle.setAttribute('aria-expanded', 'false');
                    toggle.focus();
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

        // Auth integration
        document.addEventListener('auth:state-changed', (e) => {
            if (e.detail) {
                Toast.show('Welcome, ' + (e.detail.username || e.detail.avatar_name) + '!', 'success');
            } else {
                Toast.show('You have been logged out.', 'warning', 'Logged Out');
            }
        });
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
    window.Toast = Toast;
    window.TrustChain = TrustChain;

})();
