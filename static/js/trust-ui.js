// ============================================================
// Toast Notification System
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

// ============================================================
// Trust Chain API Integration
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
                // Trust endpoint not available — use defaults from partial
                console.debug('TrustChain: Trust endpoint unavailable, using defaults');
            }
        } catch (e) {
            // Trust endpoint not available — use defaults from partial
            console.debug('TrustChain: Trust fetch failed, using defaults', e);
        }
    },

    updateUI(data) {
        // Update trust badge
        const badge = document.getElementById('trust-badge');
        const scoreEl = document.getElementById('trust-score-value');
        const referralChain = document.getElementById('referral-chain');
        const badActorBadge = document.getElementById('bad-actor-badge');
        const badActorFlag = document.getElementById('bad-actor-flag');

        if (!data) return;

        // Trust level badge
        if (badge && data.trust_level) {
            const level = data.trust_level.toLowerCase();
            badge.className = `trust-badge trust-${level}`;
            badge.setAttribute('data-trust-level', level);
            const textEl = badge.querySelector('.trust-badge-text');
            if (textEl) textEl.textContent = level.charAt(0).toUpperCase() + level.slice(1);
            badge.setAttribute('aria-label', `Trust level: ${level}`);
        }

        // Trust score value
        if (scoreEl && data.trust_score) {
            scoreEl.textContent = `${data.trust_score}/100`;
        }

        // Referral chain
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

        // Bad actor status
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
// Auth integration — show toasts on login/signup outcomes
// ============================================================
const TrustAuth = {
    init() {
        document.addEventListener('auth:state-changed', (e) => {
            if (e.detail) {
                Toast.show('Welcome, ' + (e.detail.username || e.detail.avatar_name) + '!', 'success');
            } else {
                Toast.show('You have been logged out.', 'warning', 'Logged Out');
            }
        });
    }
};

// ============================================================
// Dark mode toggle enhancement
// ============================================================
const DarkModeToggle = {
    init() {
        // Desktop toggle
        document.querySelectorAll('.menu-item.theme-switch').forEach(el => {
            el.addEventListener('click', () => {
                const current = document.body.getAttribute('theme');
                const next = current === 'dark' ? 'light' : 'dark';
                setTheme(next);
                saveTheme(next);
            });
        });

        // Mobile toggle button (if present)
        const mobileToggle = document.getElementById('mobile-theme-toggle');
        if (mobileToggle) {
            mobileToggle.addEventListener('click', () => {
                const current = document.body.getAttribute('theme');
                const next = current === 'dark' ? 'light' : 'dark';
                setTheme(next);
                saveTheme(next);
            });
        }

        // Update toggle icon based on theme
        this.updateIcon();
        window.switchThemeEventSet.add(() => this.updateIcon());
    },

    updateIcon() {
        const isDark = window.isDark;
        document.querySelectorAll('.menu-item.theme-switch i').forEach(icon => {
            // Swap icon class
            if (icon.classList.contains('fa-moon')) {
                icon.className = isDark ? 'fas fa-sun fa-fw' : 'fas fa-moon fa-fw';
                icon.setAttribute('title', isDark ? 'Switch to light mode' : 'Switch to dark mode');
            } else if (icon.classList.contains('fa-sun')) {
                icon.className = isDark ? 'fas fa-moon fa-fw' : 'fas fa-sun fa-fw';
            } else {
                // Generic toggle icon
                icon.className = isDark ? 'fas fa-sun fa-fw' : 'fas fa-moon fa-fw';
            }
        });
    }
};

// ============================================================
// Mobile nav improvements
// ============================================================
const MobileNav = {
    init() {
        const toggle = document.getElementById('menu-toggle-mobile');
        const menu = document.getElementById('menu-mobile');
        if (!toggle || !menu) return;

        toggle.addEventListener('click', () => {
            const isOpen = menu.classList.toggle('open');
            toggle.classList.toggle('active');
            toggle.setAttribute('aria-expanded', isOpen);
            toggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target) && !toggle.contains(e.target)) {
                menu.classList.remove('open');
                toggle.classList.remove('active');
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
};

// ============================================================
// Skip link focus behavior
// ============================================================
const SkipLink = {
    init() {
        const skipLink = document.querySelector('.skip-link');
        if (!skipLink) return;

        skipLink.addEventListener('click', (e) => {
            e.preventDefault();
            const target = document.getElementById('main-content');
            if (target) {
                target.setAttribute('tabindex', '-1');
                target.focus();
            }
        });
    }
};

// ============================================================
// Initialization
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    Toast.init();
    TrustChain.init();
    TrustAuth.init();
    DarkModeToggle.init();
    MobileNav.init();
    SkipLink.init();

    // Expose globals for external use
    window.Toast = Toast;
    window.TrustChain = TrustChain;
    window.TrustAuth = TrustAuth;
});
