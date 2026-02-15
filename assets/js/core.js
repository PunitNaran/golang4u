/**
 * 🛡️ Core JavaScript Library for Golang4u
 * specific: "bulletproof" hardening for security, resilience, and performance.
 */

class Utils {
    /**
     * Sanitizes URL to prevent javascript: or data: injection
     * @param {string} url 
     * @returns {string|null}
     */
    static sanitizeUrl(url) {
        if (!url) return null;
        try {
            const parsed = new URL(url);
            return ['http:', 'https:'].includes(parsed.protocol) ? url : null;
        } catch {
            return null;
        }
    }

    /**
     * Creates a DOM element with classes and text
     */
    static el(tag, classes = [], text = '') {
        const node = document.createElement(tag);
        if (classes.length) node.classList.add(...classes);
        if (text) node.textContent = text;
        return node;
    }

    /**
     * Debounce function for performance
     */
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

// --- TOASTER (Notification System) ---
class Toaster {
    constructor() {
        this.container = document.createElement('div');
        this.container.id = 'toast-container';
        this.container.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; z-index: 10000;
            display: flex; flex-direction: column; gap: 10px;
        `;
        document.body.appendChild(this.container);
    }

    show(message, type = 'info') {
        const toast = document.createElement('div');
        const bg = type === 'error' ? '#ef4444' : type === 'success' ? '#22c55e' : '#3b82f6';
        toast.style.cssText = `
            background: ${bg}; color: white; padding: 12px 24px; border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1); font-family: sans-serif;
            opacity: 0; transform: translateY(20px); transition: all 0.3s ease;
            min-width: 200px;
        `;
        toast.textContent = message;
        this.container.appendChild(toast);

        // Animation
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Global instance
const toaster = new Toaster();
window.toaster = toaster;

// --- BASE CONTROLLER ---
class BaseController {
    constructor(apiUrl) {
        this.apiUrl = apiUrl;
        this.abortControllers = new Map(); // Store abort controllers by key
    }

    /**
     * Fetch with automatic abort support
     * @param {string} key - Unique key for this request type (e.g., 'posts-list')
     * @param {string} endpoint 
     * @param {object} options 
     */
    async fetchSafe(key, endpoint, options = {}) {
        // Abort previous request of same key
        if (this.abortControllers.has(key)) {
            this.abortControllers.get(key).abort();
        }

        const controller = new AbortController();
        this.abortControllers.set(key, controller);

        try {
            const res = await fetch(`${this.apiUrl}${endpoint}`, {
                ...options,
                signal: controller.signal
            });

            if (!res.ok) {
                const txt = await res.text();
                throw new Error(txt || res.statusText);
            }

            return await res.json();
        } catch (error) {
            if (error.name === 'AbortError') return null; // Ignore aborts
            throw error;
        } finally {
            this.abortControllers.delete(key);
        }
    }

    handleError(error, userMessage = 'Operation failed') {
        console.error(error);
        if (error.name !== 'AbortError') {
            window.toaster.show(`${userMessage}: ${error.message}`, 'error');
        }
    }
}

// Attach to window so it's available globally
window.Utils = Utils;
window.BaseController = BaseController;
