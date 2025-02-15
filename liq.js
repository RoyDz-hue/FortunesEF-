let currentUserId = null;
let userListener = null;

// Authentication state observer with user session handling
auth.onAuthStateChanged(async (user) => {
    console.log("Auth state changed:", user ? "User logged in" : "No user");
    
    if (!user) {
        window.location.href = 'pinlogin.html';
        return;
    }

    try {
        // Get current user document
        const userDoc = await db.collection('spinusers').doc(user.uid).get();
        
        if (userDoc.exists) {
            console.log("User document found");
            // Set up real-time listener for user balance
            if (userListener) userListener();
            
            userListener = db.collection('spinusers').doc(user.uid)
                .onSnapshot((doc) => {
                    if (doc.exists) {
                        const userData = doc.data();
                        const balanceElement = document.getElementById('userBalance');
                        if (balanceElement) {
                            balanceElement.textContent = Number(userData.balance || 0).toFixed(2);
                            console.log("Updated balance:", userData.balance);
                        }
                    }
                }, (error) => {
                    console.error("Balance listener error:", error);
                });

            // Start monitoring recharges and withdrawals
            monitorRecharges();
            monitorDeclinedWithdrawals();
        } else {
            console.error("User document not found");
        }
    } catch (error) {
        console.error("Error in auth state change:", error);
    }
});

function showAlert(message, type = 'error', timeout = 3000) {
    const alertElement = document.createElement('div');
    alertElement.className = `alert ${type}`;
    alertElement.textContent = message;
    alertElement.style.position = 'fixed';
    alertElement.style.top = '50%';
    alertElement.style.left = '50%';
    alertElement.style.transform = 'translate(-50%, -50%)';
    alertElement.style.padding = '20px 30px';
    alertElement.style.borderRadius = '8px';
    alertElement.style.zIndex = '10000';
    alertElement.style.fontSize = '16px';
    alertElement.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
    
    if (type === 'error') {
        alertElement.style.backgroundColor = '#dc3545';
        alertElement.style.color = '#fff';
    } else if (type === 'success') {
        alertElement.style.backgroundColor = '#28a745';
        alertElement.style.color = '#fff';
    }

    document.body.appendChild(alertElement);

    setTimeout(() => {
        alertElement.style.opacity = '0';
        setTimeout(() => alertElement.remove(), 300);
    }, timeout);
}

function monitorRecharges() {
    const rechargesRef = rtdb.ref('recharges');
    rechargesRef.on('value', async (snapshot) => {
        if (!snapshot.exists()) return;

        const currentUser = auth.currentUser;
        if (!currentUser) return;

        snapshot.forEach((childSnapshot) => {
            const recharge = childSnapshot.val();
            const rechargeId = childSnapshot.key;
            
            if (recharge?.status === 'completed' && 
                recharge?.email === currentUser.email && 
                recharge?.amount) {
                
                processRecharge(recharge, rechargeId, currentUser);
            }
        });
    });
}

async function processRecharge(recharge, rechargeId, currentUser) {
    try {
        const processedRef = rtdb.ref(`processedRecharges/${rechargeId}`);
        const processedSnap = await processedRef.get();
        
        if (!processedSnap.exists()) {
            const userRef = db.collection('spinusers').doc(currentUser.uid);
            const userDoc = await userRef.get();
            
            if (userDoc.exists()) {
                await userRef.update({
                    balance: firebase.firestore.FieldValue.increment(Number(recharge.amount))
                });

                await processedRef.set({
                    ...recharge,
                    processedAt: firebase.database.ServerValue.TIMESTAMP
                });

                await rtdb.ref(`recharges/${rechargeId}`).set({
                    ...recharge,
                    status: 'processed'
                });
            }
        }
    } catch (error) {
        console.error('Error processing recharge:', error);
    }
}

function monitorDeclinedWithdrawals() {
    db.collection('spinwithdrawals')
        .where("status", "==", "declined")
        .onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "modified") {
                    const withdrawal = change.doc.data();
                    if (withdrawal?.status === 'declined' && !withdrawal?.refunded) {
                        processDeclinedWithdrawal(withdrawal, change.doc.id);
                    }
                }
            });
        });
}

async function processDeclinedWithdrawal(withdrawal, withdrawalId) {
    try {
        const userRef = db.collection('spinusers').doc(withdrawal.userId);
        const userDoc = await userRef.get();
        
        if (userDoc.exists()) {
            await userRef.update({
                balance: firebase.firestore.FieldValue.increment(Number(withdrawal.amount))
            });
            
            await db.collection('spinwithdrawals').doc(withdrawalId).update({
                refunded: true,
                refundedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    } catch (error) {
        console.error('Error processing declined withdrawal:', error);
    }
}

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'flex';
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';
}

function showDepositModal() {
    const depositModal = document.getElementById('depositModal');
    const depositFrame = document.getElementById('depositFrame');
    if (!depositModal || !depositFrame) return;
    
    depositFrame.src = 'depo.html';
    depositModal.style.display = 'flex';
    depositFrame.style.display = 'block';
    
    depositFrame.onload = function() {
        try {
            depositFrame.contentWindow.postMessage('frameLoaded', '*');
        } catch (error) {
            console.error('Error communicating with iframe:', error);
        }
    };
}

function showHistoryModal(type) {
    const historyModal = document.getElementById('historyModal');
    const historyFrame = document.getElementById('historyFrame');
    if (!historyModal || !historyFrame) return;
    
    const urlMap = {
        recharge: 'spinchargeM.html',
        withdrawal: 'spindrawsM.html'
    };
    
    historyFrame.src = urlMap[type];
    historyModal.style.display = 'flex';
    historyFrame.style.display = 'block';
    
    historyFrame.onload = function() {
        try {
            historyFrame.contentWindow.postMessage('frameLoaded', '*');
        } catch (error) {
            console.error('Error communicating with iframe:', error);
        }
    };
}

async function showWithdrawModal() {
    const user = auth.currentUser;
    if (!user) return;

    try {
        // Fetch user document to check for existing MPESA details
        const userDoc = await db.collection('spinusers').doc(user.uid).get();
        const userData = userDoc.data();
        const mpesaDetails = document.getElementById('mpesaDetails');
        
        if (mpesaDetails) {
            // First-time withdrawal (no stored MPESA details)
            if (!userData.mpesaNumber || !userData.mpesaName) {
                mpesaDetails.innerHTML = `
                    <div class="form-group">
                        <label for="mpesaNumber">M-PESA Number</label>
                        <input type="tel" id="mpesaNumber" required pattern="[0-9]{10}">
                    </div>
                    <div class="form-group">
                        <label for="mpesaName">M-PESA Registered Name</label>
                        <input type="text" id="mpesaName" required>
                    </div>
                `;
            } else {
                // Subsequent withdrawal - only show amount field
                mpesaDetails.innerHTML = `
                    <div class="form-group">
                        <p class="stored-details">Withdraw to:</p>
                        <p class="stored-details">${userData.mpesaName}</p>
                        <p class="stored-details">${userData.mpesaNumber}</p>
                    </div>
                `;
            }
        }
        showModal('withdrawModal');
    } catch (error) {
        console.error('Error showing withdraw modal:', error);
        showAlert('Error loading user data');
    }
}

async function handleWithdraw(event) {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    const amountInput = document.getElementById('withdrawAmount');
    const amount = parseFloat(amountInput.value);

    if (isNaN(amount) || amount <= 0) {
        showAlert('Please enter a valid withdrawal amount');
        return;
    }

    try {
        const userRef = db.collection('spinusers').doc(user.uid);
        const userDoc = await userRef.get();
        const userData = userDoc.data();

        // Fetch withdrawal rules
        const rulesRef = rtdb.ref('ruleswithdrawal');
        const rulesSnapshot = await rulesRef.get();
        const rules = rulesSnapshot.val() || {};

        const minimumAmount = parseFloat(rules.minimum) || 0;
        const taxPercentage = parseFloat(rules.tax) || 0;

        // Validate minimum amount
        if (amount < minimumAmount) {
            showAlert(`Minimum withdrawal amount is ${minimumAmount}`);
            return;
        }

        // Check balance
        if (amount > userData.balance) {
            showAlert('Insufficient balance');
            return;
        }

        // Calculate tax and net amount
        const taxAmount = (amount * taxPercentage) / 100;
        const netAmount = amount - taxAmount;

        let mpesaNumber, mpesaName;

        // Handle first-time vs subsequent withdrawals
        if (!userData.mpesaNumber || !userData.mpesaName) {
            // First-time withdrawal - get and store details
            const mpesaNumberInput = document.getElementById('mpesaNumber');
            const mpesaNameInput = document.getElementById('mpesaName');
            
            if (!mpesaNumberInput?.value || !mpesaNameInput?.value) {
                showAlert('Please provide valid MPESA details');
                return;
            }

            mpesaNumber = mpesaNumberInput.value;
            mpesaName = mpesaNameInput.value;

            // Store MPESA details for future use
            await userRef.update({
                mpesaNumber: mpesaNumber,
                mpesaName: mpesaName
            });
        } else {
            // Subsequent withdrawal - use stored details
            mpesaNumber = userData.mpesaNumber;
            mpesaName = userData.mpesaName;
        }

        // Update balance
        await userRef.update({
            balance: firebase.firestore.FieldValue.increment(-amount)
        });

        // Create withdrawal record
        await db.collection('spinwithdrawals').add({
            userId: user.uid,
            amount: amount,
            netAmount: netAmount,
            mpesaNumber: mpesaNumber,
            mpesaName: mpesaName,
            status: 'pending',
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            email: user.email
        });

        showAlert(`Withdrawal request successful! You will receive: ${netAmount.toFixed(2)}`, 'success');
        closeModal('withdrawModal');
    } catch (error) {
        console.error('Withdrawal error:', error);
        showAlert('Withdrawal failed. Please try again');
    }
}

// Event Listeners
window.addEventListener('load', () => {
    window.onclick = (event) => {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = 'none';
        }
    };
});

window.addEventListener('message', (event) => {
    if (event.data === 'closeFrame') {
        const historyModal = document.getElementById('historyModal');
        const historyFrame = document.getElementById('historyFrame');
        if (historyModal) historyModal.style.display = 'none';
        if (historyFrame) historyFrame.style.display = 'none';
    }
});

// Make functions globally available
window.showWithdrawModal = showWithdrawModal;
window.closeModal = closeModal;
window.handleWithdraw = handleWithdraw;
window.showHistoryModal = showHistoryModal;
window.showDepositModal = showDepositModal;