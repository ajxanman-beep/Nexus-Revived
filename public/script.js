const socket = io();
socket.on('connect', () => console.log('Socket connected:', socket.id));
socket.on('connect_error', (err) => console.error('Socket connect_error:', err));
const pageId = document.body.id; 

// --- AUTH DATA ---
const savedUser = localStorage.getItem('chatUser');
let currentUser = savedUser ? JSON.parse(savedUser) : null;

// Redirects
if (!currentUser && pageId !== 'page-login') window.location.href = 'login.html';
else if (currentUser && pageId === 'page-login') window.location.href = 'index.html';

// Global Login
if (currentUser) socket.emit('login', currentUser);

// --- GLOBAL SETTINGS STORAGE ---
let userSettings = {
    soundEnabled: localStorage.getItem('soundEnabled') === 'true',
    panicLink: localStorage.getItem('panicLink') || 'https://google.com',
    cloakTitle: localStorage.getItem('cloakTitle') || '',
    cloakIcon: localStorage.getItem('cloakIcon') || ''
};
// include panic shortcut in settings
userSettings.panicShortcut = localStorage.getItem('panicShortcut') || 'Ctrl+Shift+P,Escape';

// --- ABOUT:BLANK CLOAKING SYSTEM ---
// Send tab cloaking info to parent window for about:blank embeds
function updateParentCloaking() {
    try {
        const cloakTitle = userSettings.cloakTitle || document.title;
        const cloakIcon = userSettings.cloakIcon || "https://nexus-revived.onrender.com/favicon.ico";
        
        window.parent.postMessage({
            title: cloakTitle,
            favicon: cloakIcon
        }, "*");
    } catch (e) {
        // Silently fail if not in iframe
    }
}

// Run on init
updateParentCloaking();

// Update whenever settings change
function updateCloakingOnSettingsSave() {
    updateParentCloaking();
}

// Audio context helpers for cross-device notification sounds
let audioContext = null;
let audioUnlocked = false;
function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
}
function unlockAudioOnUserGesture() {
    if (audioUnlocked) return;
    initAudioContext();
    if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => { audioUnlocked = true; }).catch(() => {});
    } else {
        audioUnlocked = true;
    }
}
// try to unlock on first user interaction
['click', 'touchstart', 'keydown'].forEach(ev => {
    document.addEventListener(ev, unlockAudioOnUserGesture, { once: true, passive: true });
});

// Play notification sound
function playNotificationSound() {
    if (!userSettings.soundEnabled) return;
    
    try {
        initAudioContext();
        // If context is suspended (mobile browsers) try to resume first
        if (audioContext.state === 'suspended') {
            audioContext.resume().catch(() => {});
        }
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.45);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.45);
    } catch(e) {
        console.log('Could not play sound:', e);
    }
}

// --- GLOBAL NOTIFICATION SYSTEM ---
function showNotification(message, type = 'info') {
    const container = document.getElementById('notifications-container');
    if (!container) return;
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <span>${message}</span>
        <button class="notification-close" onclick="this.parentElement.classList.add('removing'); setTimeout(() => this.parentElement.remove(), 300);">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    container.appendChild(notification);
    playNotificationSound();
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.classList.add('removing');
            setTimeout(() => notification.remove(), 300);
        }
    }, 5000);
}

socket.on('notification', (data) => {
    showNotification(data.message, data.type || 'info');
});

socket.on('banned', (data) => {
    alert(data.message);
    localStorage.removeItem('chatUser');
    window.location.href = 'login.html';
});

window.logout = function() {
    if(currentUser) socket.emit('chatLeave', currentUser.username); 
    localStorage.removeItem('chatUser');
    window.location.href = 'login.html';
}

// Apply cloaking on page load
function applyCloaking() {
    if (userSettings.cloakTitle) {
        document.title = userSettings.cloakTitle;
    }
    if (userSettings.cloakIcon) {
        const link = document.querySelector("link[rel='icon']") || document.createElement('link');
        link.rel = 'icon';
        link.href = userSettings.cloakIcon;
        if (!document.querySelector("link[rel='icon']")) {
            document.head.appendChild(link);
        }
    }
}

window.panicButtonAction = function() {
    const panicUrl = userSettings.panicLink || 'https://google.com';
    
    // Try multiple methods to ensure the panic action works in all contexts
    
    // Method 1: Try top-level window (works if embedded in iframe)
    try {
        if (window.top && window.top !== window) {
            window.top.location.href = panicUrl;
            return;
        }
    } catch (e) {
        // Cross-origin iframe or other restriction
    }
    
    // Method 2: Try parent window
    try {
        if (window.parent && window.parent !== window) {
            window.parent.location.href = panicUrl;
            return;
        }
    } catch (e) {
        // Cross-origin issue
    }
    
    // Method 3: Try self (works for regular pages and same-origin embeds)
    try {
        window.location.href = panicUrl;
        return;
    } catch (e) {
        // Fallback
    }
    
    // Method 4: Open in new tab if navigation fails
    try {
        window.open(panicUrl, '_blank');
    } catch (e) {
        alert('Panic link not set. Please set it in settings.');
    }
}

// helper to setup game upload button (if present on page)
function setupGameUpload() {
    const btn = document.getElementById('upload-game-btn');
    if (!btn) return;
    
    // Button now opens the modal - click handler is inline in HTML
    // No additional setup needed
}
// call once now in case elements exist
setupGameUpload();

// Setup single HTML file upload with new modal
function setupSingleHtmlUpload() {
    const gameFileInput = document.getElementById('game-file-input');
    const iconFileInput = document.getElementById('icon-file-input');
    const submitBtn = document.getElementById('add-game-submit-btn');
    const iconPreview = document.getElementById('icon-preview');
    
    if (!gameFileInput || !submitBtn) return;
    
    let selectedGameFile = null;
    let selectedIconFile = null;
    
    gameFileInput.addEventListener('change', (e) => {
        if (e.target.files[0]) {
            selectedGameFile = e.target.files[0];
            document.getElementById('game-file-label').textContent = selectedGameFile.name;
        }
    });
    
    iconFileInput.addEventListener('change', (e) => {
        if (e.target.files[0]) {
            selectedIconFile = e.target.files[0];
            document.getElementById('icon-file-label').textContent = selectedIconFile.name;
            
            // Show preview
            const reader = new FileReader();
            reader.onload = (evt) => {
                iconPreview.style.backgroundImage = `url(${evt.target.result})`;
                iconPreview.style.backgroundSize = 'contain';
                iconPreview.style.backgroundRepeat = 'no-repeat';
                iconPreview.style.backgroundPosition = 'center';
                iconPreview.style.display = 'block';
            };
            reader.readAsDataURL(selectedIconFile);
        }
    });
    
    submitBtn.onclick = async () => {
        const gameName = document.getElementById('game-name-input').value.trim();
        
        if (!gameName) {
            showNotification('Please enter a game name', 'error');
            return;
        }
        
        if (!selectedGameFile) {
            showNotification('Please select an HTML file', 'error');
            return;
        }
        
        if (!selectedIconFile) {
            showNotification('Please select an icon image', 'error');
            return;
        }
        
        try {
            // Read HTML file
            const htmlContent = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsText(selectedGameFile);
            });
            
            if (htmlContent.length > 5000000) {
                showNotification('HTML file too large (max 5MB)', 'error');
                return;
            }
            
            // Read icon file as DataURL
            const iconDataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(selectedIconFile);
            });
            
            // Get the icon file extension
            const iconExt = selectedIconFile.name.substring(selectedIconFile.name.lastIndexOf('.')) || '.png';
            const iconFileName = 'icon' + iconExt.toLowerCase();
            
            // Emit to server
            socket.emit('adminUploadGame', {
                folderName: gameName,
                files: {
                    'index.html': htmlContent,
                    [iconFileName]: iconDataUrl
                }
            });
            
            showNotification('Uploading game...', 'info');
            
            // Close modal and reset after a delay to allow server events to process
            setTimeout(() => {
                document.getElementById('add-game-modal').classList.add('hidden');
                resetGameModal();
            }, 300);
        } catch (error) {
            showNotification('Error processing files: ' + error.message, 'error');
        }
    };
}

// Reset the game upload modal
window.resetGameModal = function() {
    document.getElementById('game-name-input').value = '';
    document.getElementById('game-file-input').value = '';
    document.getElementById('icon-file-input').value = '';
    document.getElementById('game-file-label').textContent = 'Select HTML File';
    document.getElementById('icon-file-label').textContent = 'Select Icon Image';
    document.getElementById('icon-preview').style.display = 'none';
}

setupSingleHtmlUpload();

// global listener for new games
socket.on('newGameUploaded', ({filename}) => {
    showNotification(`New game uploaded: ${filename}`, 'success');
});

// listener for admin upload responses
socket.on('adminActionResponse', (data) => {
    if (data.success) {
        showNotification(data.message, 'success');
    } else {
        showNotification(data.message, 'error');
    }
});

// Keyboard shortcut listener for panic button
document.addEventListener('keydown', function handlePanicKey(e) {
    // Skip if user is typing in an input field
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || active.isContentEditable)) {
        return;
    }

    const shortcut = userSettings.panicShortcut || 'Ctrl+Shift+P,Escape';
    if (eventMatchesShortcut(e, shortcut)) {
        try { e.preventDefault(); e.stopPropagation(); } catch(_) {}
        console.log('Panic key activated');
        panicButtonAction();
    }
}, true);

// Also listen on window for panic shortcuts (works in embedded contexts)
try {
    if (window.top && window.top !== window) {
        window.top.document.addEventListener('keydown', function handleTopPanicKey(e) {
            const active = window.top.document.activeElement;
            if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || active.isContentEditable)) {
                return;
            }
            const shortcut = userSettings.panicShortcut || 'Ctrl+Shift+P,Escape';
            if (eventMatchesShortcut(e, shortcut)) {
                try { e.preventDefault(); e.stopPropagation(); } catch(_) {}
                console.log('Panic key activated from parent');
                panicButtonAction();
            }
        }, true);
    }
} catch (e) {
    // Cross-origin, skip parent listener
}

// helper to compare keyboard events against a shortcut string
function eventMatchesShortcut(e, shortcutStr) {
    if (!shortcutStr) return false;
    const combos = shortcutStr.split(',').map(s => s.trim().toLowerCase());
    for (const combo of combos) {
        if (!combo) continue;
        const parts = combo.split('+').map(p => p.trim());
        let required = {ctrl:false,shift:false,alt:false,meta:false, key:null};
        for (const part of parts) {
            const p = part.toLowerCase();
            if (p === 'ctrl' || p === 'control') required.ctrl = true;
            else if (p === 'shift') required.shift = true;
            else if (p === 'alt') required.alt = true;
            else if (p === 'meta' || p === 'cmd' || p === 'command') required.meta = true;
            else if (p) required.key = p;
        }
        if (required.ctrl !== e.ctrlKey) continue;
        if (required.shift !== e.shiftKey) continue;
        if (required.alt !== e.altKey) continue;
        if (required.meta !== e.metaKey) continue;
        if (required.key) {
            if (e.key.toLowerCase() === required.key) return true;
            continue;
        }
        // if no specific key, treat as match (mostly modifiers only)
        return true;
    }
    return false;
}


window.toggleSettings = function() {
    const modal = document.getElementById('settings-modal');
    if(!modal) return;
    
    if(modal.classList.contains('hidden')) {
        modal.classList.remove('hidden');
        // Populate current values
        document.getElementById('set-new-username').value = currentUser.username;
        document.getElementById('set-new-pfp').value = '';
        document.getElementById('set-new-password').value = '';
        document.getElementById('current-username-display').innerText = currentUser.username;
        document.getElementById('sound-toggle').checked = userSettings.soundEnabled;
        document.getElementById('panic-link').value = userSettings.panicLink;
        const shortcutInput = document.getElementById('panic-shortcut');
        if (shortcutInput) shortcutInput.value = userSettings.panicShortcut;
        document.getElementById('cloak-title').value = userSettings.cloakTitle;
        document.getElementById('cloak-icon').value = userSettings.cloakIcon;
        
        // Show current profile picture
        const pfpPreview = document.getElementById('profile-pic-preview');
        if(pfpPreview) {
            pfpPreview.src = currentUser.pfp || 'https://i.pravatar.cc/150';
        }
    } else {
        modal.classList.add('hidden');
    }
};

window.saveSettings = function() {
    const n = document.getElementById('set-new-username').value;
    const p = document.getElementById('set-new-password').value;
    const img = document.getElementById('set-new-pfp').value;
    
    // Save new settings
    userSettings.soundEnabled = document.getElementById('sound-toggle').checked;
    userSettings.panicLink = document.getElementById('panic-link').value || 'https://google.com';
    const shortcutInput = document.getElementById('panic-shortcut');
    userSettings.panicShortcut = shortcutInput ? (shortcutInput.value || 'Ctrl+Shift+P,Escape') : 'Ctrl+Shift+P,Escape';
    userSettings.cloakTitle = document.getElementById('cloak-title').value;
    userSettings.cloakIcon = document.getElementById('cloak-icon').value;
    
    localStorage.setItem('soundEnabled', userSettings.soundEnabled);
    localStorage.setItem('panicLink', userSettings.panicLink);
    localStorage.setItem('panicShortcut', userSettings.panicShortcut);
    localStorage.setItem('cloakTitle', userSettings.cloakTitle);
    localStorage.setItem('cloakIcon', userSettings.cloakIcon);
    
    applyCloaking();
    updateParentCloaking();
    socket.emit('updateProfile', { newUsername: n, newPassword: p, newPfp: img });
};

socket.on('updateProfileResponse', (data) => {
    if(data.success) {
        const currentStore = JSON.parse(localStorage.getItem('chatUser'));
        const passToSave = document.getElementById('set-new-password').value || currentStore.password;
        const pfpToSave = data.pfp || currentStore.pfp || 'https://i.pravatar.cc/150';
        const newCreds = { username: data.username, password: passToSave, isAdmin: currentUser.isAdmin, pfp: pfpToSave };
        localStorage.setItem('chatUser', JSON.stringify(newCreds));
        currentUser = newCreds;
        
        // Update display
        const displayName = document.getElementById('display-name');
        const displayPfp = document.getElementById('display-pfp');
        if(displayName) displayName.innerText = data.username;
        if(displayPfp) displayPfp.src = pfpToSave;
        
        alert("Profile updated!");
        const modal = document.getElementById('settings-modal');
        if(modal) modal.classList.add('hidden');
    } else {
        alert(data.message);
    }
});

// --- TIME FORMATTER ---
function formatTimeCentral(isoString) {
    const d = isoString ? new Date(isoString) : new Date();
    return d.toLocaleTimeString('en-US', {
        timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: true
    });
}

// ==========================================
// --- PAGE: LOGIN ---
// ==========================================
if (pageId === 'page-login') {
    const authError = document.getElementById('auth-error');
    const handleAuth = (data) => {
        if (data.success) {
            const pass = document.getElementById('password').value;
            const userData = { 
                username: data.username, 
                password: pass,
                isAdmin: data.isAdmin || false
            };
            localStorage.setItem('chatUser', JSON.stringify(userData));
            currentUser = userData;
            window.location.href = 'index.html';
        } else {
            authError.innerText = data.message;
        }
    };
    window.register = () => {
        const u = document.getElementById('username').value.trim();
        const p = document.getElementById('password').value.trim();
        if(u && p) socket.emit('register', { username: u, password: p });
    };
    window.login = () => {
        const u = document.getElementById('username').value.trim();
        const p = document.getElementById('password').value.trim();
        if(u && p) socket.emit('login', { username: u, password: p });
    };
    socket.on('registerResponse', handleAuth);
    socket.on('loginResponse', handleAuth);
}

// ==========================================
// --- PAGE: HOME ---
// ==========================================
if (pageId === 'page-home') {
    socket.on('loginResponse', (data) => {
        if(data.success) {
            currentUser.isAdmin = data.isAdmin || false;
            localStorage.setItem('chatUser', JSON.stringify(currentUser));
            document.getElementById('display-name').innerText = data.username;
            document.getElementById('display-pfp').src = data.pfp || 'https://i.pravatar.cc/150';
            
            // Show/hide admin button
            const adminBtn = document.getElementById('admin-panel-btn');
            if(adminBtn) adminBtn.style.display = data.isAdmin ? 'flex' : 'none';
            
            // Show/hide upload game button
            const uploadGameBtn = document.getElementById('upload-game-btn');
            if(uploadGameBtn) uploadGameBtn.style.display = data.isAdmin ? 'block' : 'none';
        }
    });

    // Tab visibility listener for yellow dot
    document.addEventListener('visibilitychange', function() {
        const isHidden = document.hidden;
        const dots = document.querySelectorAll('.online-dot');
        dots.forEach(dot => {
            dot.style.color = isHidden ? '#FFD700' : 'var(--primary)';
        });
    });

    socket.on('updateUserList', (users) => {
        const list = document.getElementById('online-users-list');
        if(list) {
            list.innerHTML = '';
            users.forEach(user => {
                const li = document.createElement('li');
                const username = typeof user === 'string' ? user : user.username;
                const pfp = typeof user === 'string' ? 'https://i.pravatar.cc/150?u=' + user : user.pfp;
                const dotColor = document.hidden ? '#FFD700' : 'var(--primary)';
                li.innerHTML = `<img src="${pfp}" alt="${username}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover; margin-right: 8px;"><i class="fas fa-circle online-dot" style="font-size: 0.5rem; color: ${dotColor};"></i> ${username}`;
                li.style.display = 'flex';
                li.style.alignItems = 'center';
                list.appendChild(li);
            });
        }
    });

    // Show admin button if admin
    if(currentUser && currentUser.isAdmin) {
        const adminBtn = document.getElementById('admin-panel-btn');
        if(adminBtn) adminBtn.style.display = 'flex';
    }

    // Admin panel functionality
    window.toggleAdminPanel = function() {
        const modal = document.getElementById('admin-modal');
        if(!modal) return;
        
        if(modal.classList.contains('hidden')) {
            modal.classList.remove('hidden');
            socket.emit('getAdminData');
        } else {
            modal.classList.add('hidden');
        }
    };

    socket.on('adminDataResponse', (data) => {
        if(!data.success) {
            alert('Admin access denied');
            return;
        }
        updateAdminPanelData(data);
    });

    function updateAdminPanelData(data) {
        const usersList = document.getElementById('admin-users-list');
        const messagesList = document.getElementById('admin-messages-list');
        const deletedMsgsList = document.getElementById('admin-deleted-messages-list');
        const userCountEl = document.getElementById('admin-user-count');
        const messageCountEl = document.getElementById('admin-message-count');
        const onlineCountEl = document.getElementById('admin-online-count');
        const deletedCountEl = document.getElementById('admin-deleted-count');

        if(userCountEl) userCountEl.innerText = data.users.length;
        if(messageCountEl) messageCountEl.innerText = data.messageCount;
        if(onlineCountEl) onlineCountEl.innerText = data.onlineUsers.length;
        if(deletedCountEl) deletedCountEl.innerText = data.deletedMessageCount;

        if(usersList) {
            usersList.innerHTML = '';
            data.users.forEach(user => {
                const li = document.createElement('li');
                const adminBadge = user.isAdmin ? ' <span style="color: var(--primary); font-weight: 700;">[ADMIN]</span>' : '';
                const pfp = user.pfp || 'https://i.pravatar.cc/150';
                li.style.marginBottom = '12px';
                li.style.paddingBottom = '12px';
                li.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
                li.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%; gap: 10px;">
                        <div style="display: flex; gap: 10px; align-items: flex-start; flex: 1;">
                            <img src="${pfp}" alt="${user.username}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover; border: 1px solid var(--primary); flex-shrink: 0;">
                            <div style="flex: 1;">
                                <span><strong>${user.username}</strong>${adminBadge}</span>
                                <div style="font-size: 0.8rem; color: #999; margin-top: 4px;">Messages: ${user.messageCount}</div>
                            </div>
                        </div>
                        <div style="display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end;">
                            <button class="btn-outline" style="padding: 4px 10px; font-size: 0.7rem; border: 1px solid ${user.isAdmin ? 'var(--danger)' : 'var(--primary)'};" onclick="toggleAdminUser('${user.username}', ${!user.isAdmin})">${user.isAdmin ? 'Remove Admin' : 'Make Admin'}</button>
                            <button class="btn-outline" style="padding: 4px 10px; font-size: 0.7rem; border: 1px solid var(--secondary);" onclick="viewUserMessages('${user.username}')">View</button>
                            <button class="btn-outline" style="padding: 4px 10px; font-size: 0.7rem; border: 1px solid #ffc107;" onclick="muteUser('${user.username}')">Mute</button>
                            <button class="btn-outline" style="padding: 4px 10px; font-size: 0.7rem; border: 1px solid #ff9800;" onclick="banUser('${user.username}')">Ban</button>
                            <button class="btn-outline" style="padding: 4px 10px; font-size: 0.7rem; border: 1px solid #ff5722;" onclick="ipBanUser('${user.username}')">IP Ban</button>
                            <button class="btn-danger" style="padding: 4px 10px; font-size: 0.7rem;" onclick="deleteAdminUserAll('${user.username}')">Delete All</button>
                        </div>
                    </div>
                `;
                usersList.appendChild(li);
            });
        }

        if(messagesList) {
            messagesList.innerHTML = '';
            const recentMsgs = data.totalMessages.slice(-5).reverse();
            if(recentMsgs.length === 0) {
                const li = document.createElement('li');
                li.innerText = 'No messages';
                li.style.color = '#999';
                messagesList.appendChild(li);
            } else {
                recentMsgs.forEach(msg => {
                    const li = document.createElement('li');
                    const time = new Date(msg.timestamp).toLocaleTimeString();
                    li.innerHTML = `<span style="font-weight: 600;">${msg.user}</span> <span style="color: #999;">${time}</span><br/><span style="font-size: 0.85rem;">"${msg.text.substring(0, 50)}${msg.text.length > 50 ? '...' : ''}"</span>`;
                    li.style.marginBottom = '10px';
                    li.style.paddingBottom = '10px';
                    li.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
                    messagesList.appendChild(li);
                });
            }
        }

        if(deletedMsgsList) {
            deletedMsgsList.innerHTML = '';
            const recentDeleted = data.deletedMessages.slice(-5).reverse();
            if(recentDeleted.length === 0) {
                const li = document.createElement('li');
                li.innerText = 'No deleted messages';
                li.style.color = '#999';
                deletedMsgsList.appendChild(li);
            } else {
                recentDeleted.forEach(msg => {
                    const li = document.createElement('li');
                    const time = new Date(msg.timestamp).toLocaleTimeString();
                    const deletedTime = msg.deletedAt ? new Date(msg.deletedAt).toLocaleTimeString() : 'Unknown';
                    li.innerHTML = `<span style="font-weight: 600;">${msg.user}</span> <span style="color: #d63031;">[DELETED by ${msg.deletedBy}]</span><br/><span style="font-size: 0.8rem; color: #999;">${time} → ${deletedTime}</span><br/><span style="font-size: 0.85rem; opacity: 0.6;">"${msg.text.substring(0, 40)}${msg.text.length > 40 ? '...' : ''}"</span>`;
                    li.style.marginBottom = '10px';
                    li.style.paddingBottom = '10px';
                    li.style.borderBottom = '1px solid rgba(255,71,87,0.2)';
                    deletedMsgsList.appendChild(li);
                });
            }
        }
    }

    window.toggleAdminUser = function(username, makeAdmin) {
        if(confirm(`${makeAdmin ? 'Promote' : 'Demote'} ${username}?`)) {
            socket.emit('adminMakeAdmin', { targetUsername: username, makeAdmin: makeAdmin });
        }
    };

    window.deleteAdminUserAll = function(username) {
        if(confirm(`DELETE ALL data for ${username}? This includes all messages and account data. This CANNOT be undone!`)) {
            socket.emit('adminDeleteUserData', { targetUsername: username });
        }
    };

    window.viewUserMessages = function(username) {
        socket.emit('adminGetUserMessages', { targetUsername: username });
    };

    socket.on('adminUserMessagesResponse', (data) => {
        if(!data.success) {
            alert('Could not fetch user messages');
            return;
        }

        const userPfp = data.pfp || 'https://i.pravatar.cc/150?u=' + data.username;
        let content = `<div style="text-align: center; margin-bottom: 20px;">
            <img src="${userPfp}" alt="${data.username}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 2px solid var(--primary); margin-bottom: 10px;">
            <h3 style="color: var(--primary); margin: 10px 0 0 0;">${data.username}'s Messages</h3>
        </div>`;
        content += `<div style="margin-bottom: 15px;"><strong>Active Messages: ${data.messages.length}</strong></div>`;
        
        if(data.messages.length > 0) {
            content += '<div style="max-height: 300px; overflow-y: auto; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px; margin-bottom: 15px;">';
            data.messages.forEach(msg => {
                const time = new Date(msg.timestamp).toLocaleTimeString();
                content += `<div style="margin-bottom: 8px; padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.1);"><span style="color: #999;">${time}</span><br/><span>"${msg.text}"</span></div>`;
            });
            content += '</div>';
        } else {
            content += '<div style="color: #999; margin-bottom: 15px;">No active messages</div>';
        }

        content += `<div style="margin-bottom: 15px;"><strong>Deleted Messages: ${data.deletedMessages.length}</strong></div>`;
        
        if(data.deletedMessages.length > 0) {
            content += '<div style="max-height: 300px; overflow-y: auto; background: rgba(255,71,87,0.1); padding: 10px; border-radius: 8px; border: 1px solid rgba(255,71,87,0.2);">';
            data.deletedMessages.forEach(msg => {
                const time = new Date(msg.timestamp).toLocaleTimeString();
                const deletedTime = new Date(msg.deletedAt).toLocaleTimeString();
                content += `<div style="margin-bottom: 8px; padding: 8px; border-bottom: 1px solid rgba(255,71,87,0.2);"><span style="color: #d63031;">[DELETED by ${msg.deletedBy}]</span><br/><span style="color: #999;">${time} → ${deletedTime}</span><br/><span>"${msg.text}"</span></div>`;
            });
            content += '</div>';
        } else {
            content += '<div style="color: #999;">No deleted messages</div>';
        }

        const modal = document.getElementById('user-messages-modal');
        if(modal) {
            modal.innerHTML = content + '<div style="display: flex; gap: 10px; margin-top: 15px;"><button onclick="this.parentElement.parentElement.classList.add(\'hidden\')" class="btn-outline" style="flex: 1;">Close</button></div>';
            modal.classList.remove('hidden');
        }
    });

    window.deleteAdminUser = function(username) {
        if(confirm(`Delete user ${username}?`)) {
            socket.emit('adminDeleteUser', { targetUsername: username });
        }
    };

    window.clearAllMessages = function() {
        if(confirm('Clear all messages? This cannot be undone.')) {
            socket.emit('adminClearMessages');
        }
    };

    socket.on('adminActionResponse', (data) => {
        alert(data.message);
        if(data.success) socket.emit('getAdminData');
    });
}

// ==========================================
// --- PAGE: CHAT ROOM ---
// ==========================================
if (pageId === 'page-chat') {
    const messagesDiv = document.getElementById('messages');
    const msgInput = document.getElementById('msg-input');
    const onlineList = document.getElementById('online-users-list');
    const typingDiv = document.getElementById('typing-indicator');
    let typingTimeout;

    socket.emit('chatJoin', currentUser.username);

    // Show/hide admin button
    if(currentUser && currentUser.isAdmin) {
        const adminBtn = document.getElementById('admin-panel-btn');
        if(adminBtn) adminBtn.style.display = 'flex';
    }

    window.addEventListener('beforeunload', () => {
        socket.emit('chatLeave', currentUser.username);
    });

    if (!document.hidden) socket.emit('markAllSeen');
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) socket.emit('markAllSeen');
    });

    socket.emit('loadHistory');

    socket.on('updateUserList', (users) => {
        if(onlineList) {
            onlineList.innerHTML = '';
            users.forEach(user => {
                const li = document.createElement('li');
                const username = typeof user === 'string' ? user : user.username;
                const pfp = typeof user === 'string' ? 'https://i.pravatar.cc/150?u=' + user : user.pfp;
                const isMe = username === currentUser.username ? " <span style='opacity:0.5; margin-left: 8px;'>(You)</span>" : "";
                const dotColor = document.hidden ? '#FFD700' : 'var(--primary)';
                li.innerHTML = `<img src="${pfp}" alt="${username}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover; margin-right: 8px;"><i class="fas fa-circle online-dot" style="font-size: 0.5rem; color: ${dotColor};"></i> <span>${username}${isMe}</span>`;
                li.style.display = 'flex';
                li.style.alignItems = 'center';
                onlineList.appendChild(li);
            });
        }
    });

    const updateOrAppendMessage = (data) => {
        const existingWrapper = document.getElementById(`wrapper-${data.id}`);
        
        // 1. System Messages
        if (data.user === 'System' || data.type === 'system') {
            if(existingWrapper) return; // Don't duplicate system messages
            const sysDiv = document.createElement('div');
            sysDiv.className = 'system-message-wrapper';
            sysDiv.innerHTML = `<span>${data.text} &bull; ${formatTimeCentral(data.timestamp)}</span>`;
            messagesDiv.appendChild(sysDiv);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
            return;
        }

        // 2. Data Prep
        // Fix: Case insensitive check to prevent alignment bugs
        const isMe = data.user.toLowerCase() === currentUser.username.toLowerCase();
        const viewers = data.seenBy ? data.seenBy.filter(u => u !== data.user) : [];
        let seenText = '';
        if (viewers.length > 0) seenText = viewers.length > 5 ? `Seen by ${viewers.length}` : `Seen by ${viewers.join(', ')}`;

        // 3. Render
        if (existingWrapper) {
            const seenEl = existingWrapper.querySelector('.seen-status');
            if (seenEl) seenEl.innerText = seenText;
        } else {
            const wrapper = document.createElement('div');
            wrapper.id = `wrapper-${data.id}`;
            wrapper.classList.add('message-wrapper');
            wrapper.classList.add(isMe ? 'me' : 'other'); // This triggers CSS alignment

            const pfp = data.pfp || 'https://i.pravatar.cc/150';
            const timeStr = formatTimeCentral(data.timestamp);
            
            const deleteHtml = isMe ? 
                `<i class="fas fa-trash delete-icon" onclick="deleteMsg('${data.id}')" title="Delete"></i>` : '';
            
            // Admin can delete any message
            const adminDeleteHtml = (currentUser && currentUser.isAdmin && !isMe) ? 
                `<i class="fas fa-trash delete-icon" onclick="adminDeleteMsg('${data.id}')" title="Admin Delete" style="color: #ff4757;"></i>` : '';

            // Bubble content
            const nameColor = isMe ? '#000' : 'var(--primary)';

            wrapper.innerHTML = `
                <div class="msg-row">
                    ${!isMe ? `<img src="${pfp}" class="msg-pfp">` : ''} 
                    
                    <div class="msg-bubble">
                        <div class="msg-header">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <img src="${pfp}" alt="${data.user}" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover;">
                                <span class="username" style="color: ${nameColor}">${data.user}</span>
                            </div>
                            <div style="display:flex; gap:8px; align-items:center;">
                                <span class="timestamp">${timeStr}</span>
                                ${adminDeleteHtml}
                                ${deleteHtml}
                            </div>
                        </div>
                        <div class="msg-text">${data.text}</div>
                    </div>
                </div>
                <div class="seen-status">${seenText}</div>
            `;

            messagesDiv.appendChild(wrapper);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
            // If a welcome banner existed, remove it now that a real message is present
            removeWelcomeIfPresent();
            if (!document.hidden && !isMe && !data.seenBy.includes(currentUser.username)) {
                socket.emit('markSeen', data.id);
            }
        }
    };

    socket.on('message', updateOrAppendMessage);
    socket.on('messageUpdated', updateOrAppendMessage);
    socket.on('loadHistory', (h) => {
        messagesDiv.innerHTML = '';
        h.forEach(msg => updateOrAppendMessage(msg));
        if(!document.hidden) socket.emit('markAllSeen');
    });

    // Ensure welcome message on initial load (also handle case of empty history)
    socket.on('loadHistory', (h) => {
        // no-op - handled above
    });

    // run check after small delay to ensure loadHistory finished
    setTimeout(() => { if (pageId === 'page-chat') showWelcomeIfEmpty(); }, 250);

    // Ensure a persistent welcome message when there is no message history
    function showWelcomeIfEmpty() {
        const messagesDiv = document.getElementById('messages');
        if (!messagesDiv) return;
        // If there are no message wrappers or system messages, show welcome
        const hasMessages = messagesDiv.querySelector('.message-wrapper, .system-message-wrapper, .chat-message');
        if (!hasMessages && !document.getElementById('welcome-message')) {
            const welcome = document.createElement('div');
            welcome.id = 'welcome-message';
            welcome.style.textAlign = 'center';
            welcome.style.color = '#aaa';
            welcome.style.marginTop = '14px';
            welcome.innerHTML = `<div style="padding:18px 10px;">` +
                `<i class="fas fa-comment-dots" style="font-size:2.2rem; margin-bottom:8px; display:block; color:rgba(255,255,255,0.7);"></i>` +
                `<div style="color: #ccc; font-size:1rem;">Welcome to the chat room.</div>` +
            `</div>`;
            messagesDiv.appendChild(welcome);
        }
    }

    // Remove welcome if a real message appears
    function removeWelcomeIfPresent() {
        const w = document.getElementById('welcome-message');
        if (w && w.parentElement) w.parentElement.removeChild(w);
    }

    // Typing
    msgInput.addEventListener('input', () => {
        socket.emit('typing');
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => socket.emit('stopTyping'), 1000);
    });
    socket.on('userTyping', (u) => typingDiv.innerText = `${u} is typing...`);
    socket.on('userStoppedTyping', () => typingDiv.innerText = '');

    // Send
    document.getElementById('chat-form').addEventListener('submit', (e) => {
        e.preventDefault();
        if(msgInput.value) {
            socket.emit('chatMessage', msgInput.value);
            msgInput.value = '';
            socket.emit('stopTyping');
        }
    });

    // Actions
    window.deleteMsg = (id) => { if(confirm("Delete this message?")) socket.emit('deleteMessage', id); }
    
    // Admin delete any message
    window.adminDeleteMsg = (id) => { 
        if(confirm("Delete this message?")) {
            socket.emit('adminDeleteMessage', { msgId: id });
        }
    }
    
    socket.on('messageDeleted', (id) => { socket.emit('loadHistory'); });

    // Admin panel functionality for chat
    window.toggleAdminPanel = function() {
        const modal = document.getElementById('admin-modal');
        if(!modal) return;
        
        if(modal.classList.contains('hidden')) {
            modal.classList.remove('hidden');
            socket.emit('getAdminData');
        } else {
            modal.classList.add('hidden');
        }
    };

    socket.on('adminDataResponse', (data) => {
        if(!data.success) {
            alert('Admin access denied');
            return;
        }
        updateAdminPanelData(data);
    });

    function updateAdminPanelData(data) {
        const usersList = document.getElementById('admin-users-list');
        const messagesList = document.getElementById('admin-messages-list');
        const deletedMsgsList = document.getElementById('admin-deleted-messages-list');
        const userCountEl = document.getElementById('admin-user-count');
        const messageCountEl = document.getElementById('admin-message-count');
        const onlineCountEl = document.getElementById('admin-online-count');
        const deletedCountEl = document.getElementById('admin-deleted-count');

        if(userCountEl) userCountEl.innerText = data.users.length;
        if(messageCountEl) messageCountEl.innerText = data.messageCount;
        if(onlineCountEl) onlineCountEl.innerText = data.onlineUsers.length;
        if(deletedCountEl) deletedCountEl.innerText = data.deletedMessageCount;

        if(usersList) {
            usersList.innerHTML = '';
            data.users.forEach(user => {
                const li = document.createElement('li');
                const adminBadge = user.isAdmin ? ' <span style="color: var(--primary); font-weight: 700;">[ADMIN]</span>' : '';
                li.style.marginBottom = '12px';
                li.style.paddingBottom = '12px';
                li.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
                li.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%; gap: 10px;">
                        <div style="flex: 1;">
                            <span><i class="fas fa-user"></i> <strong>${user.username}</strong>${adminBadge}</span>
                            <div style="font-size: 0.8rem; color: #999; margin-top: 4px;">Messages: ${user.messageCount}</div>
                        </div>
                        <div style="display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end;">
                            <button class="btn-outline" style="padding: 4px 10px; font-size: 0.7rem; border: 1px solid ${user.isAdmin ? 'var(--danger)' : 'var(--primary)'};" onclick="toggleAdminUser('${user.username}', ${!user.isAdmin})">${user.isAdmin ? 'Remove Admin' : 'Make Admin'}</button>
                            <button class="btn-outline" style="padding: 4px 10px; font-size: 0.7rem; border: 1px solid var(--secondary);" onclick="viewUserMessages('${user.username}')">View</button>
                            <button class="btn-outline" style="padding: 4px 10px; font-size: 0.7rem; border: 1px solid #ffc107;" onclick="muteUser('${user.username}')">Mute</button>
                            <button class="btn-outline" style="padding: 4px 10px; font-size: 0.7rem; border: 1px solid #ff9800;" onclick="banUser('${user.username}')">Ban</button>
                            <button class="btn-outline" style="padding: 4px 10px; font-size: 0.7rem; border: 1px solid #ff5722;" onclick="ipBanUser('${user.username}')">IP Ban</button>
                            <button class="btn-danger" style="padding: 4px 10px; font-size: 0.7rem;" onclick="deleteAdminUserAll('${user.username}')">Delete All</button>
                        </div>
                    </div>
                `;
                usersList.appendChild(li);
            });
        }

        if(messagesList) {
            messagesList.innerHTML = '';
            const recentMsgs = data.totalMessages.slice(-5).reverse();
            if(recentMsgs.length === 0) {
                const li = document.createElement('li');
                li.innerText = 'No messages';
                li.style.color = '#999';
                messagesList.appendChild(li);
            } else {
                recentMsgs.forEach(msg => {
                    const li = document.createElement('li');
                    const time = new Date(msg.timestamp).toLocaleTimeString();
                    // Add admin delete button per message
                    const deleteBtn = currentUser && currentUser.isAdmin ? ` <button class="btn-outline" style="padding:4px 8px; font-size:0.8rem; margin-left:8px;" onclick="adminDeleteMsg('${msg.id}')">Delete</button>` : '';
                    li.innerHTML = `<span style="font-weight: 600;">${msg.user}</span> <span style="color: #999;">${time}</span>${deleteBtn}<br/><span style="font-size: 0.85rem;">"${msg.text.substring(0, 50)}${msg.text.length > 50 ? '...' : ''}"</span>`;
                    li.style.marginBottom = '10px';
                    li.style.paddingBottom = '10px';
                    li.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
                    messagesList.appendChild(li);
                });
            }
        }

        if(deletedMsgsList) {
            deletedMsgsList.innerHTML = '';
            const recentDeleted = data.deletedMessages.slice(-5).reverse();
            if(recentDeleted.length === 0) {
                const li = document.createElement('li');
                li.innerText = 'No deleted messages';
                li.style.color = '#999';
                deletedMsgsList.appendChild(li);
            } else {
                recentDeleted.forEach(msg => {
                    const li = document.createElement('li');
                    const time = new Date(msg.timestamp).toLocaleTimeString();
                    const deletedTime = msg.deletedAt ? new Date(msg.deletedAt).toLocaleTimeString() : 'Unknown';
                    li.innerHTML = `<span style="font-weight: 600;">${msg.user}</span> <span style="color: #d63031;">[DELETED by ${msg.deletedBy}]</span><br/><span style="font-size: 0.8rem; color: #999;">${time} → ${deletedTime}</span><br/><span style="font-size: 0.85rem; opacity: 0.6;">"${msg.text.substring(0, 40)}${msg.text.length > 40 ? '...' : ''}"</span>`;
                    li.style.marginBottom = '10px';
                    li.style.paddingBottom = '10px';
                    li.style.borderBottom = '1px solid rgba(255,71,87,0.2)';
                    deletedMsgsList.appendChild(li);
                });
            }
        }
    }

    window.toggleAdminUser = function(username, makeAdmin) {
        if(confirm(`${makeAdmin ? 'Promote' : 'Demote'} ${username}?`)) {
            socket.emit('adminMakeAdmin', { targetUsername: username, makeAdmin: makeAdmin });
        }
    };

    window.deleteAdminUserAll = function(username) {
        if(confirm(`DELETE ALL data for ${username}? This includes all messages and account data. This CANNOT be undone!`)) {
            socket.emit('adminDeleteUserData', { targetUsername: username });
        }
    };

    window.viewUserMessages = function(username) {
        socket.emit('adminGetUserMessages', { targetUsername: username });
    };

    socket.on('adminUserMessagesResponse', (data) => {
        if(!data.success) {
            alert('Could not fetch user messages');
            return;
        }

        const userPfp = data.pfp || 'https://i.pravatar.cc/150?u=' + data.username;
        let content = `<div style="text-align: center; margin-bottom: 20px;">
            <img src="${userPfp}" alt="${data.username}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 2px solid var(--primary); margin-bottom: 10px;">
            <h3 style="color: var(--primary); margin: 10px 0 0 0;">${data.username}'s Messages</h3>
        </div>`;
        content += `<div style="margin-bottom: 15px;"><strong>Active Messages: ${data.messages.length}</strong></div>`;
        
        if(data.messages.length > 0) {
            content += '<div style="max-height: 300px; overflow-y: auto; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px; margin-bottom: 15px;">';
            data.messages.forEach(msg => {
                const time = new Date(msg.timestamp).toLocaleTimeString();
                content += `<div style="margin-bottom: 8px; padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.1);"><span style="color: #999;">${time}</span><br/><span>"${msg.text}"</span></div>`;
            });
            content += '</div>';
        } else {
            content += '<div style="color: #999; margin-bottom: 15px;">No active messages</div>';
        }

        content += `<div style="margin-bottom: 15px;"><strong>Deleted Messages: ${data.deletedMessages.length}</strong></div>`;
        
        if(data.deletedMessages.length > 0) {
            content += '<div style="max-height: 300px; overflow-y: auto; background: rgba(255,71,87,0.1); padding: 10px; border-radius: 8px; border: 1px solid rgba(255,71,87,0.2);">';
            data.deletedMessages.forEach(msg => {
                const time = new Date(msg.timestamp).toLocaleTimeString();
                const deletedTime = new Date(msg.deletedAt).toLocaleTimeString();
                content += `<div style="margin-bottom: 8px; padding: 8px; border-bottom: 1px solid rgba(255,71,87,0.2);"><span style="color: #d63031;">[DELETED by ${msg.deletedBy}]</span><br/><span style="color: #999;">${time} → ${deletedTime}</span><br/><span>"${msg.text}"</span></div>`;
            });
            content += '</div>';
        } else {
            content += '<div style="color: #999;">No deleted messages</div>';
        }

        const modal = document.getElementById('user-messages-modal');
        if(modal) {
            modal.innerHTML = content + '<div style="display: flex; gap: 10px; margin-top: 15px;"><button onclick="this.parentElement.parentElement.classList.add(\'hidden\')" class="btn-outline" style="flex: 1;">Close</button></div>';
            modal.classList.remove('hidden');
        }
    });

    window.deleteAdminUser = function(username) {
        if(confirm(`Delete user ${username}?`)) {
            socket.emit('adminDeleteUser', { targetUsername: username });
        }
    };

    window.clearAllMessages = function() {
        if(confirm('Clear all messages? This cannot be undone.')) {
            socket.emit('adminClearMessages');
        }
    };

    socket.on('adminActionResponse', (data) => {
        alert(data.message);
        if(data.success) socket.emit('getAdminData');
    });
}

// --- GLOBAL ADMIN CONTROL FUNCTIONS ---
window.muteUser = function(username) {
    const minutes = prompt('Mute for how many minutes?', '5');
    if (minutes) {
        socket.emit('adminMuteUser', { targetUsername: username, duration: parseInt(minutes) * 60000 });
    }
};

window.banUser = function(username) {
    if (confirm(`Ban ${username}? They won't be able to login.`)) {
        socket.emit('adminBanUser', { targetUsername: username });
    }
};

window.ipBanUser = function(username) {
    if (confirm(`IP Ban ${username}? Their entire IP will be blocked.`)) {
        socket.emit('adminIPBan', { targetUsername: username });
    }
};

// ==========================================
// --- PAGE: VIDEO CALL ---
// ==========================================
if (pageId === 'page-call') {
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    const callStatus = document.getElementById('call-status');
    const userList = document.getElementById('call-users-list');
    const hangupBtn = document.getElementById('hangup-btn');
    const incomingModal = document.getElementById('incoming-modal');
    
    // Show/hide admin button
    if(currentUser && currentUser.isAdmin) {
        const adminBtn = document.getElementById('admin-panel-btn');
        if(adminBtn) adminBtn.style.display = 'flex';
    }

    // Admin panel functionality for call page
    window.toggleAdminPanel = function() {
        const modal = document.getElementById('admin-modal');
        if(!modal) return;
        
        if(modal.classList.contains('hidden')) {
            modal.classList.remove('hidden');
            socket.emit('getAdminData');
        } else {
            modal.classList.add('hidden');
        }
    };

    socket.on('adminDataResponse', (data) => {
        if(!data.success) {
            alert('Admin access denied');
            return;
        }
        updateAdminPanelData(data);
    });

    function updateAdminPanelData(data) {
        const usersList = document.getElementById('admin-users-list');
        const messagesList = document.getElementById('admin-messages-list');
        const deletedMsgsList = document.getElementById('admin-deleted-messages-list');
        const userCountEl = document.getElementById('admin-user-count');
        const messageCountEl = document.getElementById('admin-message-count');
        const onlineCountEl = document.getElementById('admin-online-count');
        const deletedCountEl = document.getElementById('admin-deleted-count');

        if(userCountEl) userCountEl.innerText = data.users.length;
        if(messageCountEl) messageCountEl.innerText = data.messageCount;
        if(onlineCountEl) onlineCountEl.innerText = data.onlineUsers.length;
        if(deletedCountEl) deletedCountEl.innerText = data.deletedMessageCount;

        if(usersList) {
            usersList.innerHTML = '';
            data.users.forEach(user => {
                const li = document.createElement('li');
                const adminBadge = user.isAdmin ? ' <span style="color: var(--primary); font-weight: 700;">[ADMIN]</span>' : '';
                li.style.marginBottom = '12px';
                li.style.paddingBottom = '12px';
                li.style.borderBottom = '1px solid rgba(255,255,255,0.1)';

                const left = document.createElement('div');
                left.style.flex = '1';
                left.innerHTML = `<span><i class="fas fa-user"></i> <strong>${user.username}</strong>${adminBadge}</span>`;
                const meta = document.createElement('div');
                meta.style.fontSize = '0.8rem';
                meta.style.color = '#999';
                meta.style.marginTop = '4px';
                meta.innerText = `Messages: ${user.messageCount}`;
                left.appendChild(meta);

                const actions = document.createElement('div');
                actions.style.display = 'flex';
                actions.style.gap = '6px';
                actions.style.flexWrap = 'wrap';
                actions.style.justifyContent = 'flex-end';

                // Make Admin / Remove Admin
                const adminBtn = document.createElement('button');
                adminBtn.className = 'btn-outline';
                adminBtn.style.padding = '4px 10px';
                adminBtn.style.fontSize = '0.7rem';
                adminBtn.style.border = `1px solid ${user.isAdmin ? 'var(--danger)' : 'var(--primary)'}`;
                adminBtn.innerText = user.isAdmin ? 'Remove Admin' : 'Make Admin';
                adminBtn.onclick = () => { if(confirm(`${user.isAdmin ? 'Demote' : 'Promote'} ${user.username}?`)) socket.emit('adminMakeAdmin', { targetUsername: user.username, makeAdmin: !user.isAdmin }); };
                actions.appendChild(adminBtn);

                // View messages
                const viewBtn = document.createElement('button');
                viewBtn.className = 'btn-outline';
                viewBtn.style.padding = '4px 10px';
                viewBtn.style.fontSize = '0.7rem';
                viewBtn.style.border = '1px solid var(--secondary)';
                viewBtn.innerText = 'View';
                viewBtn.onclick = () => viewUserMessages(user.username);
                actions.appendChild(viewBtn);

                // Don't allow admin actions on yourself
                const isMe = currentUser && currentUser.username === user.username;
                if (!isMe) {
                    // Mute
                    const muteBtn = document.createElement('button');
                    muteBtn.className = 'btn-outline';
                    muteBtn.style.padding = '4px 10px';
                    muteBtn.style.fontSize = '0.7rem';
                    muteBtn.style.border = '1px solid #ffc107';
                    muteBtn.innerText = 'Mute';
                    muteBtn.onclick = () => {
                        const minutes = prompt('Mute for how many minutes?', '5');
                        if (minutes) socket.emit('adminMuteUser', { targetUsername: user.username, duration: parseInt(minutes) * 60000 });
                    };
                    actions.appendChild(muteBtn);

                    // Ban
                    const banBtn = document.createElement('button');
                    banBtn.className = 'btn-outline';
                    banBtn.style.padding = '4px 10px';
                    banBtn.style.fontSize = '0.7rem';
                    banBtn.style.border = '1px solid #ff9800';
                    banBtn.innerText = 'Ban';
                    banBtn.onclick = () => { if (confirm(`Ban ${user.username}? They won't be able to login.`)) socket.emit('adminBanUser', { targetUsername: user.username }); };
                    actions.appendChild(banBtn);

                    // IP Ban
                    const ipBanBtn = document.createElement('button');
                    ipBanBtn.className = 'btn-outline';
                    ipBanBtn.style.padding = '4px 10px';
                    ipBanBtn.style.fontSize = '0.7rem';
                    ipBanBtn.style.border = '1px solid #ff5722';
                    ipBanBtn.innerText = 'IP Ban';
                    ipBanBtn.onclick = () => { if (confirm(`IP Ban ${user.username}? Their entire IP will be blocked.`)) socket.emit('adminIPBan', { targetUsername: user.username }); };
                    actions.appendChild(ipBanBtn);
                }

                // Delete All (account/messages)
                const delBtn = document.createElement('button');
                delBtn.className = 'btn-danger';
                delBtn.style.padding = '4px 10px';
                delBtn.style.fontSize = '0.7rem';
                delBtn.innerText = 'Delete All';
                delBtn.onclick = () => { if (confirm(`DELETE ALL data for ${user.username}? This cannot be undone!`)) socket.emit('adminDeleteUserData', { targetUsername: user.username }); };
                actions.appendChild(delBtn);

                const container = document.createElement('div');
                container.style.display = 'flex';
                container.style.justifyContent = 'space-between';
                container.style.alignItems = 'flex-start';
                container.style.width = '100%';
                container.style.gap = '10px';
                container.appendChild(left);
                container.appendChild(actions);

                li.appendChild(container);
                usersList.appendChild(li);
            });
        }

        if(messagesList) {
            messagesList.innerHTML = '';
            const recentMsgs = data.totalMessages.slice(-5).reverse();
            if(recentMsgs.length === 0) {
                const li = document.createElement('li');
                li.innerText = 'No messages';
                li.style.color = '#999';
                messagesList.appendChild(li);
            } else {
                recentMsgs.forEach(msg => {
                    const li = document.createElement('li');
                    const time = new Date(msg.timestamp).toLocaleTimeString();
                    li.innerHTML = `<span style="font-weight: 600;">${msg.user}</span> <span style="color: #999;">${time}</span><br/><span style="font-size: 0.85rem;">"${msg.text.substring(0, 50)}${msg.text.length > 50 ? '...' : ''}"</span>`;
                    li.style.marginBottom = '10px';
                    li.style.paddingBottom = '10px';
                    li.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
                    messagesList.appendChild(li);
                });
            }
        }

        if(deletedMsgsList) {
            deletedMsgsList.innerHTML = '';
            const recentDeleted = data.deletedMessages.slice(-5).reverse();
            if(recentDeleted.length === 0) {
                const li = document.createElement('li');
                li.innerText = 'No deleted messages';
                li.style.color = '#999';
                deletedMsgsList.appendChild(li);
            } else {
                recentDeleted.forEach(msg => {
                    const li = document.createElement('li');
                    const time = new Date(msg.timestamp).toLocaleTimeString();
                    const deletedTime = msg.deletedAt ? new Date(msg.deletedAt).toLocaleTimeString() : 'Unknown';
                    li.innerHTML = `<span style="font-weight: 600;">${msg.user}</span> <span style="color: #d63031;">[DELETED by ${msg.deletedBy}]</span><br/><span style="font-size: 0.8rem; color: #999;">${time} → ${deletedTime}</span><br/><span style="font-size: 0.85rem; opacity: 0.6;">"${msg.text.substring(0, 40)}${msg.text.length > 40 ? '...' : ''}"</span>`;
                    li.style.marginBottom = '10px';
                    li.style.paddingBottom = '10px';
                    li.style.borderBottom = '1px solid rgba(255,71,87,0.2)';
                    deletedMsgsList.appendChild(li);
                });
            }
        }
    }

    window.toggleAdminUser = function(username, makeAdmin) {
        if(confirm(`${makeAdmin ? 'Promote' : 'Demote'} ${username}?`)) {
            socket.emit('adminMakeAdmin', { targetUsername: username, makeAdmin: makeAdmin });
        }
    };

    window.deleteAdminUserAll = function(username) {
        if(confirm(`DELETE ALL data for ${username}? This includes all messages and account data. This CANNOT be undone!`)) {
            socket.emit('adminDeleteUserData', { targetUsername: username });
        }
    };

    window.viewUserMessages = function(username) {
        socket.emit('adminGetUserMessages', { targetUsername: username });
    };

    socket.on('adminUserMessagesResponse', (data) => {
        if(!data.success) {
            alert('Could not fetch user messages');
            return;
        }

        const userPfp = data.pfp || 'https://i.pravatar.cc/150?u=' + data.username;
        let content = `<div style="text-align: center; margin-bottom: 20px;">
            <img src="${userPfp}" alt="${data.username}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 2px solid var(--primary); margin-bottom: 10px;">
            <h3 style="color: var(--primary); margin: 10px 0 0 0;">${data.username}'s Messages</h3>
        </div>`;
        content += `<div style="margin-bottom: 15px;"><strong>Active Messages: ${data.messages.length}</strong></div>`;
        
        if(data.messages.length > 0) {
            content += '<div style="max-height: 300px; overflow-y: auto; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px; margin-bottom: 15px;">';
            data.messages.forEach(msg => {
                const time = new Date(msg.timestamp).toLocaleTimeString();
                content += `<div style="margin-bottom: 8px; padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.1);"><span style="color: #999;">${time}</span><br/><span>"${msg.text}"</span></div>`;
            });
            content += '</div>';
        } else {
            content += '<div style="color: #999; margin-bottom: 15px;">No active messages</div>';
        }

        content += `<div style="margin-bottom: 15px;"><strong>Deleted Messages: ${data.deletedMessages.length}</strong></div>`;
        
        if(data.deletedMessages.length > 0) {
            content += '<div style="max-height: 300px; overflow-y: auto; background: rgba(255,71,87,0.1); padding: 10px; border-radius: 8px; border: 1px solid rgba(255,71,87,0.2);">';
            data.deletedMessages.forEach(msg => {
                const time = new Date(msg.timestamp).toLocaleTimeString();
                const deletedTime = new Date(msg.deletedAt).toLocaleTimeString();
                content += `<div style="margin-bottom: 8px; padding: 8px; border-bottom: 1px solid rgba(255,71,87,0.2);"><span style="color: #d63031;">[DELETED by ${msg.deletedBy}]</span><br/><span style="color: #999;">${time} → ${deletedTime}</span><br/><span>"${msg.text}"</span></div>`;
            });
            content += '</div>';
        } else {
            content += '<div style="color: #999;">No deleted messages</div>';
        }

        const modal = document.getElementById('user-messages-modal');
        if(modal) {
            modal.innerHTML = content + '<div style="display: flex; gap: 10px; margin-top: 15px;"><button onclick="this.parentElement.parentElement.classList.add(\'hidden\')" class="btn-outline" style="flex: 1;">Close</button></div>';
            modal.classList.remove('hidden');
        }
    });

    window.deleteAdminUser = function(username) {
        if(confirm(`Delete user ${username}?`)) {
            socket.emit('adminDeleteUser', { targetUsername: username });
        }
    };

    window.clearAllMessages = function() {
        if(confirm('Clear all messages? This cannot be undone.')) {
            socket.emit('adminClearMessages');
        }
    };

    socket.on('adminActionResponse', (data) => {
        alert(data.message);
        if(data.success) socket.emit('getAdminData');
    });
    
    let localStream, remoteStream, peerConnection, pendingOffer, callerName;
    let iceQueue = [], earlyCandidates = [];

    const peerConfig = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };

    async function startLocalStream() {
        try {
            console.log('Requesting local media...');
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
            localVideo.muted = true; 
            console.log('Local media started');
            callStatus.innerText = "Ready";
        } catch (err) {
            console.error("Camera Error:", err);
            alert("Camera access denied.");
            callStatus.innerText = "Camera Blocked";
        }
    }
    startLocalStream();

    function initRemoteStream() {
        remoteStream = new MediaStream();
        remoteVideo.srcObject = remoteStream;
    }

    socket.on('updateUserList', (users) => {
        console.log('Call page - updateUserList:', users);
        userList.innerHTML = '';
        users.forEach(user => {
            const username = typeof user === 'string' ? user : user.username;
            const pfp = typeof user === 'string' ? 'https://i.pravatar.cc/150?u=' + user : user.pfp;
            if (username === currentUser.username) return;
            const li = document.createElement('li');
            const dotColor = document.hidden ? '#FFD700' : '#00e676';
            li.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;';
            li.innerHTML = `
                <span style="display: flex; align-items: center; gap: 8px;"><img src="${pfp}" alt="${username}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;"><i class="fas fa-circle online-dot" style="color:${dotColor}; font-size: 0.5rem;"></i> ${username}</span>
                <button class="call-icon-btn" onclick="startCall('${username}')" style="background:#00e676; border:none; width:30px; height:30px; border-radius:50%; cursor:pointer;"><i class="fas fa-video"></i></button>
            `;
            userList.appendChild(li);
        });
    });

    window.startCall = async (userToCall) => {
        console.log('startCall() =>', userToCall);
        if (!localStream) return alert("Camera not ready.");
        initRemoteStream();
        callStatus.innerText = `Calling ${userToCall}...`;
        hangupBtn.disabled = false;
        
        createPeerConnection(userToCall);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            console.log('Emitting call-user to', userToCall);
            socket.emit('call-user', { userToCall, offer });
        } catch (err) { console.error(err); }
    };

    socket.on('incoming-call', (data) => {
        console.log('incoming-call received:', data);
        pendingOffer = data.offer;
        callerName = data.from;
        document.getElementById('caller-name').innerText = `Incoming from ${callerName}`;
        incomingModal.classList.remove('hidden');
    });

    window.acceptCall = async () => {
        console.log('acceptCall() from:', callerName);
        if (!localStream) return alert("Camera not ready.");
        initRemoteStream();
        incomingModal.classList.add('hidden');
        callStatus.innerText = "Connecting...";
        hangupBtn.disabled = false;

        createPeerConnection(callerName);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(pendingOffer));
            while (iceQueue.length > 0) await peerConnection.addIceCandidate(iceQueue.shift());
            
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            console.log('Sending answer to', callerName);
            socket.emit('answer-call', { to: callerName, answer });
        } catch (err) { console.error(err); }
    };

    window.rejectIncomingCall = () => {
        incomingModal.classList.add('hidden');
        socket.emit('reject-call', { to: callerName });
    };

    socket.on('call-answered', async (data) => {
        console.log('call-answered received:', data);
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            while (iceQueue.length > 0) await peerConnection.addIceCandidate(iceQueue.shift());
            callStatus.innerText = "Connected";
        } catch (err) { console.error(err); }
    });

    socket.on('call-rejected', () => {
        callStatus.innerText = "Call Rejected";
        setTimeout(() => callStatus.innerText = "Ready", 2000);
        endCallLogic();
    });

    socket.on('ice-candidate', async (data) => {
        console.log('remote ice-candidate:', data);
        if (!peerConnection) {
            earlyCandidates.push(data.candidate);
            return;
        }
        try {
            if (peerConnection.remoteDescription) await peerConnection.addIceCandidate(data.candidate);
            else iceQueue.push(data.candidate);
        } catch(e) { console.error('ICE Error:', e); }
    });

    function createPeerConnection(remoteUser) {
        console.log('createPeerConnection() for', remoteUser);
        iceQueue = [];
        peerConnection = new RTCPeerConnection(peerConfig);
        if (earlyCandidates.length > 0) {
            console.log(`Processing ${earlyCandidates.length} saved candidates`);
            earlyCandidates.forEach(c => {
                if (peerConnection.remoteDescription) {
                    peerConnection.addIceCandidate(c).catch(e => console.error('Early candidate add failed:', e));
                } else {
                    iceQueue.push(c);
                }
            });
            earlyCandidates = [];
        }

        peerConnection.onicecandidate = (event) => {
            console.log('Local ICE candidate:', event.candidate);
            if(event.candidate) socket.emit('ice-candidate', { to: remoteUser, candidate: event.candidate });
        };

        peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE connection state:', peerConnection.iceConnectionState);
            if (peerConnection.iceConnectionState === 'connected') callStatus.innerText = "Connected";
            else if (peerConnection.iceConnectionState === 'disconnected') {
                callStatus.innerText = "Disconnected";
                endCallLogic();
            }
        };

        peerConnection.ontrack = (event) => {
            console.log('Remote track received:', event.track);
            if (remoteStream) {
                remoteStream.addTrack(event.track);
                if (remoteVideo.paused) remoteVideo.play().catch(e => console.error(e));
            }
        };
    }

    window.endCall = () => { location.reload(); }
    
    function endCallLogic() {
        if(peerConnection) peerConnection.close();
        peerConnection = null;
        if(remoteStream) {
            remoteStream.getTracks().forEach(t => t.stop());
            remoteStream = null;
        }
        remoteVideo.srcObject = null;
        hangupBtn.disabled = true;
        earlyCandidates = [];
    }
}

// ==========================================
// --- PAGE: GAMES ---
// ==========================================
if (pageId === 'page-games') {
    // Show/hide buttons on page load based on currentUser.isAdmin
    const adminBtn = document.getElementById('admin-panel-btn');
    const uploadBtn = document.getElementById('upload-game-btn');
    
    if (currentUser && currentUser.isAdmin) {
        if(adminBtn) adminBtn.style.display = 'flex';
        if(uploadBtn) uploadBtn.style.display = 'flex';
    } else {
        if(adminBtn) adminBtn.style.display = 'none';
        if(uploadBtn) uploadBtn.style.display = 'none';
    }
    
    // Listen for login response to update admin status on games page
    socket.on('loginResponse', (data) => {
        if(data.success) {
            currentUser.isAdmin = data.isAdmin || false;
            localStorage.setItem('chatUser', JSON.stringify(currentUser));
            
            // Show/hide admin button
            const adminBtn = document.getElementById('admin-panel-btn');
            if(adminBtn) adminBtn.style.display = data.isAdmin ? 'flex' : 'none';
            
            // Show/hide upload game button
            const uploadGameBtn = document.getElementById('upload-game-btn');
            if(uploadGameBtn) uploadGameBtn.style.display = data.isAdmin ? 'flex' : 'none';
        }
    });
    
    // Admin panel functionality for games page
    window.toggleAdminPanel = function() {
        const modal = document.getElementById('admin-modal');
        if(!modal) return;
        
        if(modal.classList.contains('hidden')) {
            modal.classList.remove('hidden');
            socket.emit('getAdminData');
        } else {
            modal.classList.add('hidden');
        }
    };

    socket.on('adminDataResponse', (data) => {
        if(!data.success) {
            showNotification('Admin access denied', 'error');
            return;
        }
        updateAdminPanelData(data);
    });

    function updateAdminPanelData(data) {
        const usersList = document.getElementById('admin-users-list');
        const messagesList = document.getElementById('admin-messages-list');
        const deletedMsgsList = document.getElementById('admin-deleted-messages-list');
        const userCountEl = document.getElementById('admin-user-count');
        const messageCountEl = document.getElementById('admin-message-count');
        const onlineCountEl = document.getElementById('admin-online-count');
        const deletedCountEl = document.getElementById('admin-deleted-count');

        if(userCountEl) userCountEl.innerText = data.users.length;
        if(messageCountEl) messageCountEl.innerText = data.messageCount;
        if(onlineCountEl) onlineCountEl.innerText = data.onlineUsers.length;
        if(deletedCountEl) deletedCountEl.innerText = data.deletedMessageCount;

        if(usersList) {
            usersList.innerHTML = '';
            data.users.forEach(user => {
                const li = document.createElement('li');
                const adminBadge = user.isAdmin ? ' <span style="color: var(--primary); font-weight: 700;">[ADMIN]</span>' : '';
                li.style.marginBottom = '12px';
                li.style.paddingBottom = '12px';
                li.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
                li.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%; gap: 10px;">
                        <div style="flex: 1;">
                            <span><i class="fas fa-user"></i> <strong>${user.username}</strong>${adminBadge}</span>
                            <div style="font-size: 0.8rem; color: #999; margin-top: 4px;">Messages: ${user.messageCount}</div>
                        </div>
                        <div style="display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end;">
                            <button class="btn-outline" style="padding: 4px 10px; font-size: 0.7rem; border: 1px solid ${user.isAdmin ? 'var(--danger)' : 'var(--primary)'};" onclick="toggleAdminUser('${user.username}', ${!user.isAdmin})">${user.isAdmin ? 'Remove Admin' : 'Make Admin'}</button>
                            <button class="btn-outline" style="padding: 4px 10px; font-size: 0.7rem; border: 1px solid var(--secondary);" onclick="viewUserMessages('${user.username}')">View</button>
                            <button class="btn-danger" style="padding: 4px 10px; font-size: 0.7rem;" onclick="deleteAdminUserAll('${user.username}')">Delete All</button>
                        </div>
                    </div>
                `;
                usersList.appendChild(li);
            });
        }

        if(messagesList) {
            messagesList.innerHTML = '';
            const recentMsgs = data.totalMessages.slice(-5).reverse();
            if(recentMsgs.length === 0) {
                const li = document.createElement('li');
                li.innerText = 'No messages';
                li.style.color = '#999';
                messagesList.appendChild(li);
            } else {
                recentMsgs.forEach(msg => {
                    const li = document.createElement('li');
                    const time = new Date(msg.timestamp).toLocaleTimeString();
                    li.innerHTML = `<span style="font-weight: 600;">${msg.user}</span> <span style="color: #999;">${time}</span><br/><span style="font-size: 0.85rem;">"${msg.text.substring(0, 50)}${msg.text.length > 50 ? '...' : ''}"</span>`;
                    li.style.marginBottom = '10px';
                    li.style.paddingBottom = '10px';
                    li.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
                    messagesList.appendChild(li);
                });
            }
        }

        if(deletedMsgsList) {
            deletedMsgsList.innerHTML = '';
            const recentDeleted = data.deletedMessages.slice(-5).reverse();
            if(recentDeleted.length === 0) {
                const li = document.createElement('li');
                li.innerText = 'No deleted messages';
                li.style.color = '#999';
                deletedMsgsList.appendChild(li);
            } else {
                recentDeleted.forEach(msg => {
                    const li = document.createElement('li');
                    const time = new Date(msg.timestamp).toLocaleTimeString();
                    const deletedTime = msg.deletedAt ? new Date(msg.deletedAt).toLocaleTimeString() : 'Unknown';
                    li.innerHTML = `<span style="font-weight: 600;">${msg.user}</span> <span style="color: #d63031;">[DELETED by ${msg.deletedBy}]</span><br/><span style="font-size: 0.8rem; color: #999;">${time} → ${deletedTime}</span><br/><span style="font-size: 0.85rem; opacity: 0.6;">"${msg.text.substring(0, 40)}${msg.text.length > 40 ? '...' : ''}"</span>`;
                    li.style.marginBottom = '10px';
                    li.style.paddingBottom = '10px';
                    li.style.borderBottom = '1px solid rgba(255,71,87,0.2)';
                    deletedMsgsList.appendChild(li);
                });
            }
        }
    }

    window.toggleAdminUser = function(username, makeAdmin) {
        if(confirm(`${makeAdmin ? 'Promote' : 'Demote'} ${username}?`)) {
            socket.emit('adminMakeAdmin', { targetUsername: username, makeAdmin: makeAdmin });
        }
    };

    window.deleteAdminUserAll = function(username) {
        if(confirm(`DELETE ALL data for ${username}? This includes all messages and account data. This CANNOT be undone!`)) {
            socket.emit('adminDeleteUserData', { targetUsername: username });
        }
    };

    window.viewUserMessages = function(username) {
        socket.emit('adminGetUserMessages', { targetUsername: username });
    };

    socket.on('adminUserMessagesResponse', (data) => {
        if(!data.success) {
            showNotification('Could not fetch user messages', 'error');
            return;
        }

        const userPfp = data.pfp || 'https://i.pravatar.cc/150?u=' + data.username;
        let content = `<div style="text-align: center; margin-bottom: 20px;">
            <img src="${userPfp}" alt="${data.username}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 2px solid var(--primary); margin-bottom: 10px;">
            <h3 style="color: var(--primary); margin: 10px 0 0 0;">${data.username}'s Messages</h3>
        </div>`;
        content += `<div style="margin-bottom: 15px;"><strong>Active Messages: ${data.messages.length}</strong></div>`;
        
        if(data.messages.length > 0) {
            content += '<div style="max-height: 300px; overflow-y: auto; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px; margin-bottom: 15px;">';
            data.messages.forEach(msg => {
                const time = new Date(msg.timestamp).toLocaleTimeString();
                content += `<div style="margin-bottom: 8px; padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.1);"><span style="color: #999;">${time}</span><br/><span>"${msg.text}"</span></div>`;
            });
            content += '</div>';
        } else {
            content += '<div style="color: #999; margin-bottom: 15px;">No active messages</div>';
        }

        content += `<div style="margin-bottom: 15px;"><strong>Deleted Messages: ${data.deletedMessages.length}</strong></div>`;
        
        if(data.deletedMessages.length > 0) {
            content += '<div style="max-height: 300px; overflow-y: auto; background: rgba(255,71,87,0.1); padding: 10px; border-radius: 8px; border: 1px solid rgba(255,71,87,0.2);">';
            data.deletedMessages.forEach(msg => {
                const time = new Date(msg.timestamp).toLocaleTimeString();
                const deletedTime = new Date(msg.deletedAt).toLocaleTimeString();
                content += `<div style="margin-bottom: 8px; padding: 8px; border-bottom: 1px solid rgba(255,71,87,0.2);"><span style="color: #d63031;">[DELETED by ${msg.deletedBy}]</span><br/><span style="color: #999;">${time} → ${deletedTime}</span><br/><span>"${msg.text}"</span></div>`;
            });
            content += '</div>';
        } else {
            content += '<div style="color: #999;">No deleted messages</div>';
        }

        const modal = document.getElementById('user-messages-modal');
        if(modal) {
            modal.innerHTML = content + '<div style="display: flex; gap: 10px; margin-top: 15px;"><button onclick="this.parentElement.parentElement.classList.add(\'hidden\')" class="btn-outline" style="flex: 1;">Close</button></div>';
            modal.classList.remove('hidden');
        }
    });

    window.clearAllMessages = function() {
        if(confirm('Clear all messages? This cannot be undone.')) {
            socket.emit('adminClearMessages');
        }
    };

    socket.on('adminActionResponse', (data) => {
        if (data.success) {
            showNotification(data.message, 'success');
        } else {
            showNotification(data.message, 'error');
        }
        if(data.success && document.getElementById('admin-modal')?.classList.contains('hidden') === false) {
            socket.emit('getAdminData');
        }
    });
}

// Apply cloaking on page load
window.addEventListener('load', applyCloaking);