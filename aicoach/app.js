// ═══════ CONFIG ═══════
const API_BASE = '/api';
const stripe = Stripe('pk_live_51Sgudg0bEpBmBdaFT6XSUmZzaZeuY9auHt9nc25dryS8UI14UhSwkWbyPMJz7PDgpnam85v31mSqbBY65UgN3SAK00NidAEYtq');
let elements;
let card;

// ═══════ STATE ═══════
let user = {
    email: localStorage.getItem('userEmail'),
    geminiKey: localStorage.getItem('userGeminiKey'),
    freeMinutesRemaining: 0,
    hasCardOnFile: false
};
let currentSessionId = null;
let sessionStartTime = null;
let timerInterval = null;
let isMeteredSession = false;

// ═══════ UI ELEMENTS ═══════
const loginModal = document.getElementById('login-modal');
const paymentModal = document.getElementById('payment-modal');
const practiceModal = document.getElementById('practice-modal');
const emailInput = document.getElementById('user-email');
const loginBtn = document.getElementById('btn-login');
const saveCardBtn = document.getElementById('btn-save-card');

// Practice elements
const practiceBody = document.getElementById('practice-chat-body');
const practiceForm = document.getElementById('practice-form');
const practiceInput = document.getElementById('practice-input');
const practiceTyping = document.getElementById('practice-typing');
const timerDisplay = document.getElementById('session-timer');
const roleDisplay = document.getElementById('session-role');
const endSessionBtn = document.getElementById('btn-end-session');

// ═══════ INIT ═══════
window.addEventListener('load', () => {
    if (user.email) {
        refreshUserStatus();
    }
    const savedKey = localStorage.getItem('userGeminiKey');
    if (savedKey) document.getElementById('user-gemini-key').value = savedKey;
    
    startChatDemo();
});

loginBtn.addEventListener('click', async () => {
    const email = emailInput.value;
    if (email && email.includes('@')) {
        localStorage.setItem('userEmail', email);
        user.email = email;
        loginModal.style.display = 'none';
        refreshUserStatus();
    }
});

async function refreshUserStatus() {
    try {
        const res = await fetch(`${API_BASE}/user/status`, {
            headers: { 'x-user-email': user.email }
        });
        const data = await res.json();
        user = { ...user, ...data };
    } catch (e) { console.error('Failed to fetch user status', e); }
}

// ═══════ CHAT DEMO (AUTOMATED) ═══════
const demoSequence = [
    { sender: 'alex', text: "Welcome to your interview prep. Ready to start?" },
    { sender: 'user', text: "Yes, I'm a bit nervous about the technical questions." },
    { sender: 'alex', text: "Don't be. Let's practice. 'Tell me about a time you handled a major system failure.'" },
    { sender: 'user', text: "Last year our main DB went down. I coordinated the failover." },
    { sender: 'alex', text: "Good start. Mention the 'Mean Time to Recovery' and how you communicated to stakeholders. Try again with that detail." }
];

async function startChatDemo() {
    const container = document.getElementById('chat-demo-body');
    if (!container) return;
    container.innerHTML = '';
    
    for (const step of demoSequence) {
        await new Promise(r => setTimeout(r, 1000)); // Thought gap
        await appendMessage(container, step.text, step.sender, true);
        await new Promise(r => setTimeout(r, 2000)); // Read gap
    }
}

document.getElementById('restart-demo').onclick = startChatDemo;

// ═══════ SESSION HANDLING ═══════
async function startSession(role = 'General Practice') {
    if (!user.email) {
        loginModal.style.display = 'flex';
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/session/start`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-user-email': user.email 
            },
            body: JSON.stringify({ role })
        });

        if (res.status === 402) {
            showPaymentModal();
            return;
        }

        const data = await res.json();
        currentSessionId = data.sessionId;
        isMeteredSession = data.isMetered;
        sessionStartTime = Date.now();
        
        // Setup Practice UI
        roleDisplay.textContent = role;
        practiceModal.style.display = 'flex';
        practiceBody.innerHTML = '';
        
        // Show/Hide Gemini Key input based on metered status
        const keyContainer = document.getElementById('gemini-key-container');
        keyContainer.style.display = isMeteredSession ? 'none' : 'block';
        
        startTimer();
        
        // Initial Message
        await appendMessage(practiceBody, `Hi! I'm Alex. Let's master this ${role} scenario. What's on your mind?`, 'alex');
        
    } catch (e) {
        console.error('Start session failed', e);
    }
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const seconds = Math.floor((Date.now() - sessionStartTime) / 1000);
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        timerDisplay.textContent = `${mins}:${secs}`;
    }, 1000);
}

// ═══════ INTERACTION ═══════
practiceForm.onsubmit = async (e) => {
    e.preventDefault();
    const text = practiceInput.value.trim();
    if (!text) return;
    
    const geminiKey = document.getElementById('user-gemini-key').value.trim();
    if (!isMeteredSession && !geminiKey) {
        alert("Please provide your Gemini API Key for the free trial.");
        return;
    }
    
    // Save key if provided
    if (geminiKey) {
        localStorage.setItem('userGeminiKey', geminiKey);
        user.geminiKey = geminiKey;
    }

    practiceInput.value = '';
    await appendMessage(practiceBody, text, 'user');
    
    // Alex Thinking
    practiceTyping.style.display = 'flex';
    
    try {
        const res = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-user-email': user.email 
            },
            body: JSON.stringify({ 
                sessionId: currentSessionId, 
                message: text,
                geminiKey: isMeteredSession ? null : geminiKey
            })
        });

        const data = await res.json();
        practiceTyping.style.display = 'none';

        if (data.error) {
            await appendMessage(practiceBody, `Error: ${data.error}`, 'alex');
        } else {
            await appendMessage(practiceBody, data.response, 'alex');
        }
    } catch (e) {
        practiceTyping.style.display = 'none';
        await appendMessage(practiceBody, "Sorry, I'm having trouble connecting right now.", 'alex');
    }
};

function getSimulatedResponse(input) {
    const responses = [
        "That's a strong point. How would you handle a follow-up question about the trade-offs of that decision?",
        "I like the confidence. Try to add a specific metric to that answer—like a percentage or time saved.",
        "Interesting. Let's pivot slightly. If a stakeholder disagreed with that approach, what would your rebuttal be?",
        "Good. Remember to breathe and keep your tone steady. You're doing great.",
        "Let's refine that. Instead of saying 'I think', try 'Based on the data, I am confident that...'"
    ];
    return responses[Math.floor(Math.random() * responses.length)];
}

async function appendMessage(container, text, sender, animated = false) {
    const msg = document.createElement('div');
    msg.className = `message ${sender}`;
    msg.textContent = text;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
    
    if (animated) {
        msg.style.opacity = '0';
        msg.style.transform = 'translateY(10px)';
        await new Promise(r => setTimeout(r, 10));
        msg.style.transition = 'all 0.4s ease';
        msg.style.opacity = '1';
        msg.style.transform = 'translateY(0)';
    }
}

endSessionBtn.onclick = endSession;

async function endSession() {
    if (!currentSessionId) return;
    clearInterval(timerInterval);
    
    const durationSeconds = Math.floor((Date.now() - sessionStartTime) / 1000);
    practiceModal.style.display = 'none';
    
    try {
        await fetch(`${API_BASE}/session/end`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-user-email': user.email 
            },
            body: JSON.stringify({ sessionId: currentSessionId, durationSeconds })
        });
        currentSessionId = null;
        alert(`Session complete! Total time: ${Math.floor(durationSeconds/60)}m ${durationSeconds%60}s`);
        refreshUserStatus();
    } catch (e) {
        console.error('End session failed', e);
        currentSessionId = null;
    }
}

// ═══════ STRIPE / PAYMENT ═══════
async function showPaymentModal() {
    paymentModal.style.display = 'flex';
    if (!elements) {
        const res = await fetch(`${API_BASE}/payment/setup`, {
            method: 'POST',
            headers: { 'x-user-email': user.email }
        });
        const { clientSecret } = await res.json();
        elements = stripe.elements();
        card = elements.create('card', {
            style: {
                base: {
                    color: '#fff',
                    fontFamily: 'Outfit, sans-serif',
                    '::placeholder': { color: '#94a3b8' }
                }
            }
        });
        card.mount('#card-element');
        saveCardBtn.onclick = () => handleSaveCard(clientSecret);
    }
}

async function handleSaveCard(clientSecret) {
    const { error } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card: card }
    });
    if (error) {
        document.getElementById('card-errors').textContent = error.message;
    } else {
        await fetch(`${API_BASE}/payment/confirm`, {
            method: 'POST',
            headers: { 'x-user-email': user.email }
        });
        paymentModal.style.display = 'none';
        user.hasCardOnFile = true;
        alert("Card saved! You can now start your practice session.");
    }
}

// Global UI wiring
document.getElementById('cta-start').onclick = () => document.getElementById('scenarios').scrollIntoView({behavior: 'smooth'});
document.getElementById('pricing-start').onclick = () => startSession('Premium Practice');

// Fade In Observer
const fadeObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) entry.target.classList.add('visible');
    });
}, { threshold: 0.1 });
document.querySelectorAll('.fade-in').forEach(el => fadeObserver.observe(el));
