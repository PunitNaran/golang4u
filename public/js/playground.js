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
                // Dark Mode detection
                const isDark = document.documentElement.classList.contains('dark') ||
                    (localStorage.getItem('theme') === 'dark');

                try {
                    window.editor = monaco.editor.create(editorContainer, {
                        value: `package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello, Golang4u!")\n}\n`,
                        language: 'go',
                        theme: isDark ? 'vs-dark' : 'vs',
                        automaticLayout: true,
                        minimap: { enabled: false },
                        fontSize: 14,
                        scrollBeyondLastLine: false,
                    });
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
}
