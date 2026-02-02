document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('add-post-form');
    if (!form) return;

    // Type Selector Logic
    const typeButtons = document.querySelectorAll('.type-selector');
    const formTypeInput = document.getElementById('formType');

    typeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update UI
            typeButtons.forEach(b => {
                b.classList.remove('active', 'bg-indigo-500', 'text-white');
                b.classList.add('bg-gray-200', 'dark:bg-gray-700');
            });
            btn.classList.add('active', 'bg-indigo-500', 'text-white');
            btn.classList.remove('bg-gray-200', 'dark:bg-gray-700');

            // Update State
            formTypeInput.value = btn.dataset.value;

            // TODO: Toggle Visibility of fieldsets (fields-news, fields-learn etc)
            // For now, alerting user if switching to unimplemented types in UI
            if (btn.dataset.value !== 'news') {
                alert('Only "News" form UI is fully implemented in this demo. Backend supports all.');
            }
        });
    });

    // Form Submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!auth.user) {
            showMessage('You must be logged in to post.', 'error');
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerText;
        submitBtn.disabled = true;
        submitBtn.innerText = 'Publishing...';

        try {
            const formData = new FormData(form);
            const type = formTypeInput.value;

            // Backend expects /submit-form/:type
            // Ensure API_BASE is defined (from auth.js)
            const response = await fetch(`${API_BASE}/submit-form/${type}`, {
                method: 'POST',
                // Content-Type is auto-set by fetch when using FormData (multipart/form-data)
                body: formData
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || `Server Error: ${response.status}`);
            }

            showMessage('Post published successfully!', 'success');
            form.reset();

            // Redirect after delay
            setTimeout(() => {
                window.location.href = '/posts';
            }, 2000);

        } catch (error) {
            console.error(error);
            showMessage(error.message, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = originalText;
        }
    });

    function showMessage(msg, type) {
        const c = document.getElementById('msg-container');
        c.innerText = msg;
        c.classList.remove('hidden', 'text-green-600', 'bg-green-100', 'text-red-600', 'bg-red-100');

        if (type === 'success') {
            c.classList.add('text-green-600', 'bg-green-100');
        } else {
            c.classList.add('text-red-600', 'bg-red-100');
        }
        c.classList.remove('hidden');
    }
});
