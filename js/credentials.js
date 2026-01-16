document.addEventListener('DOMContentLoaded', () => {
    // Load saved credentials on page load
    loadGoogleCreds();
    loadGeminiCreds();
    function loadGoogleCreds() {
        const clientId = localStorage.getItem('google_client_id');
        if (clientId) {
            document.getElementById('google_client_id').value = clientId;
        }
    }

    function loadGeminiCreds() {
        const apiKey = localStorage.getItem('cx_gemini_key');
        if (apiKey) {
            document.getElementById('gemini_api_key').value = apiKey;
        }
    }
});

function saveGoogleCreds() {
    const clientId = document.getElementById('google_client_id').value.trim();
    if (clientId) {
        localStorage.setItem('google_client_id', clientId);
        alert('Google Client ID saved!');
    } else {
        alert('Please enter a Client ID.');
    }
}

function saveGeminiCreds() {
    const apiKey = document.getElementById('gemini_api_key').value.trim();
    if (apiKey) {
        localStorage.setItem('cx_gemini_key', apiKey);
        alert('Gemini API Key saved!');
    } else {
        alert('Please enter an API Key.');
    }
}

async function testGeminiCreds() {
    const apiKey = document.getElementById('gemini_api_key').value.trim();
    if (!apiKey) {
        alert('Please enter a Gemini API Key to test.');
        return;
    }

    const model = "gemini-2.5-flash"; // Directly use the correct model here
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const prompt = "Please say 'test' in a raw text response, with no other formatting or characters.";

    let attempts = 0;
    let success = false;
    const maxAttempts = 3;

    while (attempts < maxAttempts && !success) {
        attempts++;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }]
                })
            });

            if (response.ok) {
                alert('✅ Gemini API Key is valid!');
                success = true;
            } else {
                const error = await response.json();
                throw new Error(error.error.message);
            }
        } catch (error) {
            if (attempts >= maxAttempts) {
                alert(`❌ Gemini API Key is invalid or has an issue: ${error.message}`);
            } else {
                alert(`Attempt ${attempts} failed. Retrying in ${attempts * 2}s...`);
                await new Promise(resolve => setTimeout(resolve, attempts * 2000));
            }
        }
    }
}