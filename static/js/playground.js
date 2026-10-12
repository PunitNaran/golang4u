// Logic runs immediately (script is injected after load)

// Only run if editor container exists
const editorContainer = document.getElementById('monaco-editor');

if (editorContainer) {
    // Standard Monaco Require (loaded by loader.js)
    // We expect window.require to be present now
    const req = window.require;
    const outputConsole = document.getElementById('output-console');

    function logToUI(msg, isError) {
        if (!outputConsole) return;
        if (isError) {
            const time = new Date().toLocaleTimeString();
            outputConsole.innerText += `[${time}] Error: ${msg}\n`;
            outputConsole.style.color = '#ef4444';
        }
    }

    if (!req) {
        logToUI("Monaco Loader not found (require is missing).", true);
    } else {
        try {
            const vsPath = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs';
            req.config({ paths: { 'vs': vsPath } });

            req(['vs/editor/editor.main'], function () {
                // Dark Mode detection: DoIt's setTheme() writes the `theme`
                // attribute to <body> (baseof.html). Read body, fall back to
                // <html> for old builds.
                const getTheme = () => {
                    const t = document.body.getAttribute('theme') || document.documentElement.getAttribute('theme');
                    return (t === 'dark' || t === 'black') ? 'vs-dark' : 'vs';
                };

                try {
                    window.editor = monaco.editor.create(editorContainer, {
                        value: `package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello, Golang4u!")\n}\n`,
                        language: 'go',
                        theme: getTheme(),
                        automaticLayout: true,
                        minimap: { enabled: false },
                        fontSize: 14,
                        scrollBeyondLastLine: false,
                    });

                    // WebKit (iPhone) can leave .view-lines parked off-screen
                    // (translate(-99999px)) until a layout() fires; automaticLayout's
                    // rAF hook misses the first paint there. Force a layout now and
                    // once after first paint. ponytail: one extra layout() is a
                    // no-op if already sized — keep it, don't add a retry timer.
                    window.editor.layout();
                    requestAnimationFrame(() => window.editor.layout());

                    // Listen for theme attribute changes on <body> — that's
                    // where DoIt's setTheme() writes them (baseof.html).
                    const observer = new MutationObserver((mutations) => {
                        mutations.forEach((mutation) => {
                            if (mutation.type === "attributes" && mutation.attributeName === "theme") {
                                monaco.editor.setTheme(getTheme());
                            }
                        });
                    });
                    observer.observe(document.body, { attributes: true });

                    // Force a layout whenever the container's size changes.
                    // Monaco's automaticLayout can miss the container's first
                    // size (race), leaving .view-lines at 0x0 and the code
                    // invisible. A ResizeObserver is the reliable fix.
                    const ro = new ResizeObserver(() => {
                        if (window.editor) window.editor.layout();
                    });
                    ro.observe(editorContainer);

                } catch (createErr) {
                    logToUI(`Failed to create editor: ${createErr.message}`, true);
                }

                // Handle Resize
                window.addEventListener('resize', () => {
                    if (window.editor) window.editor.layout();
                });

            }, function (err) {
                console.error("Monaco Load Error:", err);
                logToUI(`Failed to load Monaco modules: ${err.message}`, true);
            });
        } catch (e) {
            logToUI(`Loader Error: ${e.message}`, true);
        }
    }

    // Toast Logic
    function showToast(message) {
        const toast = document.getElementById('toast');
        const toastMsg = document.getElementById('toast-message');
        if (toast && toastMsg) {
            toastMsg.innerText = message;

            // Show
            toast.classList.remove('hidden');
            // Force reflow
            toast.offsetHeight;
            toast.classList.remove('-translate-y-full', 'opacity-0', 'pointer-events-none');

            // Auto-hide after 5s
            setTimeout(() => {
                toast.classList.add('-translate-y-full', 'opacity-0', 'pointer-events-none');
                // Fully hide after transition ends
                setTimeout(() => {
                    toast.classList.add('hidden');
                }, 300);
            }, 5000);
        }
    }

    // Run Button Logic
    const runBtn = document.getElementById('run-btn');
    if (runBtn) {
        runBtn.addEventListener('click', async () => {
            if (!window.editor) {
                logToUI("Editor not ready. Please wait for it to load.", true);
                return;
            }

            const code = window.editor.getValue();
            if (outputConsole) {
                outputConsole.innerText = 'Compiling and running...';
                outputConsole.classList.add('text-gray-500');
            }

            try {
                const params = new URLSearchParams();
                params.append('version', '2');
                params.append('body', code);

                const apiUrl = window.GO4U_API_URL || "http://localhost:8080";
                const response = await fetch(`${apiUrl}/compile`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: params
                });

                if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

                const result = await response.json();
                let output = '';
                if (result.Errors) output += `Errors:\n${result.Errors}\n`;
                if (result.Events) for (const event of result.Events) output += event.Message;

                if (outputConsole) {
                    outputConsole.innerText = output || 'Program exited with no output.';
                    outputConsole.classList.remove('text-gray-500');
                }

            } catch (error) {
                console.error(error);
                if (outputConsole) {
                    outputConsole.innerText = `Error: ${error.message}\n\nCheck console for details.`;
                    outputConsole.classList.remove('text-gray-500');
                    outputConsole.classList.add('text-red-500');
                }
            }
        });
    }

    // Share Button Logic
    const shareBtn = document.getElementById('share-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', async () => {
            if (!window.editor) {
                showToast("Editor not ready! Please wait. ⏳");
                return;
            }
            const code = window.editor.getValue();
            const btnHtml = shareBtn.innerHTML;
            shareBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            shareBtn.disabled = true;

            try {
                const apiUrl = window.GO4U_API_URL || "http://localhost:8080";
                const response = await fetch(`${apiUrl}/snippet`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify({ code: code })
                });

                if (response.status === 401) {
                    showToast("Please login to share snippets! 🔐");
                    return;
                }

                if (!response.ok) throw new Error("Failed to save snippet");

                const data = await response.json();

                // Update URL
                const newUrl = `${window.location.pathname}?id=${data.id}`;
                window.history.pushState({ path: newUrl }, '', newUrl);

                // Copy to Clipboard
                await navigator.clipboard.writeText(window.location.href);
                showToast("Link copied to clipboard! 📋");

            } catch (error) {
                console.error(error);
                if (error.name === 'TypeError') {
                    showToast("Network error: Please check your connection or CORS settings 🌐");
                } else {
                    showToast("Error saving snippet ❌");
                }
            } finally {
                shareBtn.innerHTML = btnHtml;
                shareBtn.disabled = false;
            }
        });
    }

    // Load Snippet from URL
    const urlParams = new URLSearchParams(window.location.search);
    const snippetId = urlParams.get('id');
    if (snippetId) {
        const apiUrl = window.GO4U_API_URL || "http://localhost:8080";
        fetch(`${apiUrl}/snippet/${snippetId}`, { credentials: 'include' })
            .then(res => {
                if (!res.ok) throw new Error("Snippet not found");
                return res.json();
            })
            .then(data => {
                if (window.editor) {
                    window.editor.setValue(data.code);
                } else {
                    // If editor not ready, wait for it (simple retry)
                    const checkEditor = setInterval(() => {
                        if (window.editor) {
                            window.editor.setValue(data.code);
                            clearInterval(checkEditor);
                        }
                    }, 100);
                }
            })
            .catch(err => {
                console.error("Failed to load snippet:", err);
                showToast("Snippet not found or expired ⚠️");
            });
    }
}
