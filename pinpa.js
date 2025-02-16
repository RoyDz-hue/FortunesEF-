    let currentUser = null;

    // Authentication state observer
    auth.onAuthStateChanged((user) => {
        if (user) {
            currentUser = user;
            initializeApp();
        } else {
            window.location.href = 'pinlogin.html';
        }
    });

    function initializeApp() {
        loadMessages();
        setupMessageListener();
        sendAuthToIframes(currentUser);
        updateWelcomeMessage(currentUser.email);
    }

    function updateWelcomeMessage(email) {
        const name = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
        document.getElementById('welcome-message').textContent =
            `Welcome back, ${name.charAt(0).toUpperCase() + name.slice(1)}`;
    }

    function sendAuthToIframes(user) {
        const message = {
            type: 'auth',
            userId: user.uid,
            email: user.email
        };

        document.querySelectorAll('iframe').forEach(iframe => {
            try {
                iframe.contentWindow.postMessage(message, window.location.origin);
            } catch (error) {
                console.error('Error sending auth to iframe:', error);
            }
        });
    }

    function switchTab(tab) {
        const frames = {
            'profile': document.getElementById('profile-frame'),
            'financials': document.getElementById('financials-frame'),
            'wheel': document.getElementById('wheel-frame')
        };

        Object.values(frames).forEach(frame => frame.classList.remove('active'));
        frames[tab].classList.add('active');

        document.querySelectorAll('.footer-nav button').forEach(button => {
            button.classList.remove('active');
        });
        event.target.classList.add('active');
    }

    function openTelegram() {
        const telegramUrl = 'https://median.co/share/xbzame#apk';
        window.open(telegramUrl, '_blank', 'noopener,noreferrer');
    }

    function openChat() {
        const modal = document.getElementById('chat-modal');
        modal.style.display = 'block';
        setTimeout(() => modal.classList.add('show'), 10);
        document.getElementById('notification-count').textContent = '0';
    }

    function closeChat() {
        const modal = document.getElementById('chat-modal');
        modal.classList.remove('show');
        setTimeout(() => modal.style.display = 'none', 300);
    }

    function sendMessage() {
        if (!currentUser) return;

        const input = document.getElementById('message-input');
        const message = input.value.trim();

        if (message) {
            const messagesRef = rtdb.ref('messages/' + currentUser.uid);
            messagesRef.push({
                content: message,
                timestamp: firebase.database.ServerValue.TIMESTAMP,
                sender: 'user'
            }).catch(error => {
                console.error('Error sending message:', error);
                alert('Failed to send message. Please try again.');
            });
            input.value = '';
        }
    }

    function loadMessages() {
        const messagesDiv = document.getElementById('chat-messages');
        const messagesRef = rtdb.ref('messages/' + currentUser.uid);

        messagesRef.off('child_added'); // Prevent duplicate listeners

        messagesRef.on('child_added', (snapshot) => {
            const message = snapshot.val();

            const messageElement = document.createElement('div');
            messageElement.classList.add('message', `${message.sender}-message`);
            messageElement.textContent = message.content;
            messagesDiv.appendChild(messageElement);

            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }, (error) => {
            console.error('Error loading messages:', error);
        });
    }

    function setupMessageListener() {
        const messagesRef = rtdb.ref('messages/' + currentUser.uid);
        let unreadCount = 0;

        messagesRef.off('child_added'); // Prevent duplicate listeners

        messagesRef.on('child_added', (snapshot) => {
            const message = snapshot.val();
            if (message.sender === 'admin' &&
                document.getElementById('chat-modal').style.display !== 'block') {
                unreadCount++;
                document.getElementById('notification-count').textContent = unreadCount;
            }
        });
    }

    function logout() {
        auth.signOut().catch(error => {
            console.error('Logout error:', error);
            alert('Error logging out. Please try again.');
        });
    }

    // Event Listeners
    document.getElementById('message-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    window.addEventListener('message', (event) => {
        if (event.origin !== window.location.origin) return;

        if (event.data.type === 'requestAuth' && currentUser) {
            sendAuthToIframes(currentUser);
        }
    });

    window.onclick = (event) => {
        const modal = document.getElementById('chat-modal');
        if (event.target === modal) {
            closeChat();
        }
    };

    window.onerror = function(msg, url, lineNo, columnNo, error) {
        console.error('Global error:', error);
        return false;
    };
