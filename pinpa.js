let currentUser = null;
let pendingAttachment = null;

// Auto-resize text input
function autoResizeInput(element) {
    element.style.height = 'auto';
    element.style.height = (element.scrollHeight) + 'px';
    
    // Limit maximum height
    const maxHeight = 150;
    if (element.scrollHeight > maxHeight) {
        element.style.height = maxHeight + 'px';
        element.style.overflowY = 'auto';
    } else {
        element.style.overflowY = 'hidden';
    }
}

auth.onAuthStateChanged((user) => {
    if (user) {
        currentUser = user;
        initializeApp();
    } else {
        window.location.href = 'pinlogin.html';
    }
});

function initializeApp() {
    listenForMessages();
    sendAuthToIframes(currentUser);
    updateWelcomeMessage(currentUser.email);
    
    // Set up the file input listener
    document.getElementById('attachment-input')
        .addEventListener('change', handleFileSelect);
    
    // Set up auto-resize for message input
    const messageInput = document.getElementById('message-input');
    messageInput.addEventListener('input', () => autoResizeInput(messageInput));
    
    // Convert input to textarea if it's not already
    if (messageInput.tagName.toLowerCase() !== 'textarea') {
        const textarea = document.createElement('textarea');
        textarea.id = 'message-input';
        textarea.className = messageInput.className;
        textarea.placeholder = 'Type your message here...';
        messageInput.parentNode.replaceChild(textarea, messageInput);
    }
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

    document.querySelectorAll('iframe').forEach((iframe) => {
        try {
            iframe.contentWindow.postMessage(message, window.location.origin);
        } catch (error) {
            console.error('Error sending auth to iframe:', error);
        }
    });
}

function switchTab(tab, event) {
    const frames = {
        profile: document.getElementById('profile-frame'),
        financials: document.getElementById('financials-frame'),
        wheel: document.getElementById('wheel-frame')
    };

    Object.values(frames).forEach((frame) => frame.classList.remove('active'));
    if (frames[tab]) {
        frames[tab].classList.add('active');
    }

    document.querySelectorAll('.footer-nav button').forEach((button) => {
        button.classList.remove('active');
    });
    if (event && event.target) {
        event.target.classList.add('active');
    }
}

function showProgressToast(progress) {
  let toast = document.getElementById('download-progress-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'download-progress-toast';
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.backgroundColor = 'rgba(0,0,0,0.7)';
    toast.style.color = 'white';
    toast.style.padding = '10px 15px';
    toast.style.borderRadius = '5px';
    toast.style.fontSize = '14px';
    toast.style.zIndex = '9999';
    document.body.appendChild(toast);
  }
  toast.textContent = `Downloading... ${progress}%`;
  if (progress >= 100) {
    setTimeout(() => {
      toast.remove();
    }, 2000);
  }
}

async function openTelegram() {
  try {
    showProgressToast(0);
    // Retrieve the metadata from Firebase RTDB
    const metadataSnapshot = await firebase.database().ref("FApp/metadata").once("value");
    const metadata = metadataSnapshot.val();
    if (!metadata) {
      alert("No APK available for download");
      showProgressToast(100);
      return;
    }
    // Mark progress after metadata retrieval
    showProgressToast(10);

    // Retrieve each Base64-encoded chunk from Firebase
    const chunks = [];
    for (let i = 0; i < metadata.chunks; i++) {
      const chunkSnapshot = await firebase.database().ref(`FApp/chunks/${i}`).once("value");
      const chunkData = chunkSnapshot.val();
      chunks.push(base64ToUint8Array(chunkData));
      // Update progress as each chunk is fetched. We'll allocate 90% for chunk fetching.
      let progressPercentage = Math.round(((i + 1) / metadata.chunks) * 90);
      showProgressToast(progressPercentage);
    }

    // Combine all chunks into a single Uint8Array
    const totalLength = chunks.reduce((sum, arr) => sum + arr.length, 0);
    const combinedArray = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combinedArray.set(chunk, offset);
      offset += chunk.length;
    }
    showProgressToast(92);

    // Decompress the combined data (pako must be loaded in your page)
    const decompressed = pako.inflate(combinedArray);
    showProgressToast(95);

    // Create a Blob from the decompressed data and trigger the download
    const blob = new Blob([decompressed], { type: "application/vnd.android.package-archive" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = metadata.fileName || "downloaded_app.apk";
    a.click();
    URL.revokeObjectURL(url);
    showProgressToast(100);
  } catch (error) {
    console.error("Download Error:", error);
    alert("Download failed: " + error.message);
  }
}

// Helper function: Converts a Base64 string to a Uint8Array
function base64ToUint8Array(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function openChat() {
    const modal = document.getElementById('chat-modal');
    modal.style.display = 'block';
    setTimeout(() => {
        modal.classList.add('show');
        // Dispatch a custom event so that listenForMessages marks admin messages as read
        const event = new Event('shown');
        modal.dispatchEvent(event);
    }, 10);
    document.getElementById('notification-count').textContent = '0';
    
    // Focus input and reset its size
    const messageInput = document.getElementById('message-input');
    messageInput.focus();
    autoResizeInput(messageInput);
}

function closeChat() {
    const modal = document.getElementById('chat-modal');
    modal.classList.remove('show');
    setTimeout(() => (modal.style.display = 'none'), 300);
}

function sendMessage() {
    if (!currentUser) {
        console.error('No authenticated user found');
        alert('Please log in to send messages');
        return;
    }

    const input = document.getElementById('message-input');
    const textMessage = input.value.trim();
    const messagesRef = rtdb.ref('messages/' + currentUser.uid);

    if (pendingAttachment) {
        const messageObject = {
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            sender: 'user',
            type: 'attachment',
            content: pendingAttachment.content,
            fileName: pendingAttachment.fileName,
            caption: textMessage
        };
        
        messagesRef.push(messageObject)
            .then(() => {
                input.value = '';
                clearAttachmentPreview();
                pendingAttachment = null;
                autoResizeInput(input);
            })
            .catch(error => {
                console.error('Error sending attachment message:', error);
                alert(`Failed to send message: ${error.message}`);
            });
    } else {
        if (!textMessage) return;
        
        messagesRef.push({
            content: textMessage,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            sender: 'user',
            type: 'text'
        })
        .then(() => {
            input.value = '';
            autoResizeInput(input);
        })
        .catch(error => {
            console.error('Error sending text message:', error);
            alert(`Failed to send message: ${error.message}`);
        });
    }
}

function listenForMessages() {
    const messagesDiv = document.getElementById('chat-messages');
    const messagesRef = rtdb.ref('messages/' + currentUser.uid);
    let unreadCount = 0;

    // Stop any previous listeners
    messagesRef.off('child_added');

    messagesRef.on('child_added', (snapshot) => {
        const message = snapshot.val();
        const messageKey = snapshot.key;
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', `${message.sender}-message`);

        if (message.type === 'attachment') {
            if (message.content.startsWith('data:image')) {
                const imgContainer = document.createElement('div');
                imgContainer.className = 'image-preview-container';
                
                const img = document.createElement('img');
                img.src = message.content;
                img.className = 'message-image';
                img.addEventListener('load', () => {
                    messagesDiv.scrollTop = messagesDiv.scrollHeight;
                });
                
                imgContainer.appendChild(img);
                messageElement.appendChild(imgContainer);
            } else {
                const fileContainer = document.createElement('div');
                fileContainer.className = 'file-preview-container';
                
                const fileIcon = document.createElement('span');
                fileIcon.textContent = '📎';
                fileIcon.className = 'file-icon';
                
                const link = document.createElement('a');
                link.href = message.content;
                link.download = message.fileName;
                link.textContent = message.fileName;
                link.className = 'file-link';
                
                fileContainer.appendChild(fileIcon);
                fileContainer.appendChild(link);
                messageElement.appendChild(fileContainer);
            }

            if (message.caption) {
                const caption = document.createElement('p');
                caption.className = 'attachment-caption';
                caption.textContent = message.caption;
                messageElement.appendChild(caption);
            }
        } else {
            const textContainer = document.createElement('p');
            textContainer.className = 'message-text';
            textContainer.textContent = message.content;
            messageElement.appendChild(textContainer);
        }

        messagesDiv.appendChild(messageElement);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;

        // Only consider admin messages for unread count
        if (message.sender === 'admin') {
            // Only update if the message hasn’t already been marked as read
            if (!message.read) {
                // If the chat modal is open, mark the message as read immediately
                if (document.getElementById('chat-modal').classList.contains('show')) {
                    messagesRef.child(messageKey).update({ read: true });
                } else {
                    // Otherwise, increment the unread count
                    unreadCount++;
                    document.getElementById('notification-count').textContent = unreadCount;
                }
            }
        }
    });

    // When the chat modal opens, mark all unread admin messages as read.
    // The custom "shown" event is now dispatched from openChat()
    const chatModal = document.getElementById('chat-modal');
    chatModal.addEventListener('shown', () => {
        messagesRef.once('value', (snapshot) => {
            snapshot.forEach((childSnapshot) => {
                const msg = childSnapshot.val();
                if (msg.sender === 'admin' && !msg.read) {
                    childSnapshot.ref.update({ read: true });
                }
            });
        });
        // Reset the counter since the user is now viewing admin chats
        unreadCount = 0;
        document.getElementById('notification-count').textContent = unreadCount;
    });
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    event.target.value = '';

    if (file.type.startsWith('video/')) {
        alert('Video uploads are not allowed.');
        return;
    }

    if (file.type.startsWith('image/')) {
        compressImage(file, 20, (compressedDataUrl) => {
            pendingAttachment = {
                content: compressedDataUrl,
                fileName: file.name,
                fileType: file.type,
                type: 'attachment'
            };
            showAttachmentPreview(pendingAttachment);
        });
    } else {
        const reader = new FileReader();
        reader.onload = function(e) {
            const base64Data = e.target.result;
            const sizeKB = (base64Data.length * 0.75) / 1024;
            if (sizeKB > 20) {
                alert('File is too large after conversion. Please select a file smaller than 20KB.');
                return;
            }
            pendingAttachment = {
                content: base64Data,
                fileName: file.name,
                fileType: file.type,
                type: 'attachment'
            };
            showAttachmentPreview(pendingAttachment);
        };
        reader.readAsDataURL(file);
    }
}

function compressImage(file, maxSizeKB, callback) {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = function(event) {
        const img = new Image();
        img.src = event.target.result;
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            const MAX_WIDTH = 300;
            const MAX_HEIGHT = 300;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) {
                    height = Math.floor(height * (MAX_WIDTH / width));
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width = Math.floor(width * (MAX_HEIGHT / height));
                    height = MAX_HEIGHT;
                }
            }

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);

            let quality = 0.9;
            (function tryCompress() {
                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                const base64Length = dataUrl.length - 'data:image/jpeg;base64,'.length;
                const fileSizeKB = (base64Length * 0.75) / 1024;

                if (fileSizeKB > maxSizeKB && quality > 0.1) {
                    quality -= 0.1;
                    tryCompress();
                } else {
                    callback(dataUrl);
                }
            })();
        };
    };
}

function showAttachmentPreview(attachment) {
    const previewContainer = document.getElementById('attachment-preview');
    if (!previewContainer) return;
    previewContainer.innerHTML = '';

    if (attachment.fileType.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = attachment.content;
        img.style.maxWidth = '100px';
        previewContainer.appendChild(img);
    } else {
        const p = document.createElement('p');
        p.textContent = attachment.fileName;
        previewContainer.appendChild(p);
    }

    const removeButton = document.createElement('button');
    removeButton.textContent = 'Remove';
    removeButton.onclick = () => {
        pendingAttachment = null;
        clearAttachmentPreview();
    };
    previewContainer.appendChild(removeButton);
}

function clearAttachmentPreview() {
    const previewContainer = document.getElementById('attachment-preview');
    if (previewContainer) {
        previewContainer.innerHTML = '';
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    const messageInput = document.getElementById('message-input');
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        messageInput.addEventListener('input', () => autoResizeInput(messageInput));
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

// Share functionality
window.addEventListener('message', (event) => {
    if (event.data.type === 'share') {
        const { platform, text } = event.data;
        const shareText = encodeURIComponent(text);
        const urls = {
            whatsapp: `https://wa.me/?text=${shareText}`,
            telegram: `https://t.me/share/url?url=${encodeURIComponent(event.data.link)}&text=${encodeURIComponent('Check this out:')}`,
            email: `mailto:?subject=${encodeURIComponent('Check out this referral')}&body=${shareText}`,
            sms: `sms:?body=${shareText}`
        };
        window.open(urls[platform], '_blank');
    }
});
