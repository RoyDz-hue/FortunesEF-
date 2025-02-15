// payment-processor.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getFirestore, doc, getDoc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

class PaymentProcessor {
    constructor() {
        this.initializeFirebase();
        this.initializeAPIConfig();
        this.initializeState();
        this.setupCoreSystems();
    }

    initializeFirebase() {
        const firebaseConfig = {
            apiKey: "AIzaSyBQ77oIT9KXEzuMy7UcfbojHAr4xxPjW30",
            authDomain: "dataload-6764a.firebaseapp.com",
            databaseURL: "https://dataload-6764a-default-rtdb.firebaseio.com",
            projectId: "dataload-6764a",
            storageBucket: "dataload-6764a.appspot.com",
            messagingSenderId: "84851374553",
            appId: "1:84851374553:web:732c98449acd462a5501c8"
        };

        this.app = initializeApp(firebaseConfig);
        this.db = getFirestore(this.app);
        this.rtdb = getDatabase(this.app);
        this.auth = getAuth(this.app);
    }

    initializeAPIConfig() {
        this.apiUsername = 'hYakRT5HZaNPofgw3LSP';
        this.apiPassword = 'ECsKFTrPKQHdfCa63HPDgMdYS7rXSxaX0GlwBMeW';
        this.baseUrl = 'https://backend.payhero.co.ke/api/v2/';
        this.credentials = btoa(`${this.apiUsername}:${this.apiPassword}`);
    }

    initializeState() {
        this.currentUser = null;
        this.userId = null;
        this.userBalance = 0;
        this.activeChecks = new Map();
        this.pendingTransactions = new Map();
        this.retryQueue = new Map();
        this.maxRetries = 3;
        this.useBackupChecking = false;
    }

    setupCoreSystems() {
        this.initializeStorage();
        this.setupAuthListener();
        this.setupBeforeUnloadHandler();
        this.initializeWorker();
        this.setupRetryMechanism();
        this.setupNetworkStatusListener();
    }

    initializeWorker() {
        try {
            const workerCode = `
                let activeChecks = new Map();

                self.onmessage = function(e) {
                    const { type, reference, credentials, baseUrl } = e.data;
                    
                    switch(type) {
                        case 'START_CHECK':
                            if (!activeChecks.has(reference)) {
                                startCheck(reference, credentials, baseUrl);
                            }
                            break;
                        case 'STOP_CHECK':
                            stopCheck(reference);
                            break;
                        case 'STOP_ALL':
                            stopAllChecks();
                            break;
                    }
                };

                function startCheck(reference, credentials, baseUrl) {
                    const interval = setInterval(async () => {
                        try {
                            const response = await fetch(
                                \`\${baseUrl}transaction-status?reference=\${reference}\`, 
                                { 
                                    headers: { 
                                        'Authorization': \`Basic \${credentials}\`,
                                        'Cache-Control': 'no-cache'
                                    } 
                                }
                            );
                            
                            if (!response.ok) throw new Error(\`HTTP error! status: \${response.status}\`);
                            
                            const data = await response.json();
                            self.postMessage({ 
                                type: 'STATUS_UPDATE', 
                                reference, 
                                status: data.status,
                                data: data 
                            });
                            
                            if (['SUCCESS', 'failed', 'cancelled'].includes(data.status)) {
                                stopCheck(reference);
                            }
                        } catch (error) {
                            self.postMessage({ type: 'ERROR', reference, error: error.message });
                        }
                    }, 5000);

                    activeChecks.set(reference, interval);
                }

                function stopCheck(reference) {
                    const interval = activeChecks.get(reference);
                    if (interval) {
                        clearInterval(interval);
                        activeChecks.delete(reference);
                    }
                }

                function stopAllChecks() {
                    activeChecks.forEach(interval => clearInterval(interval));
                    activeChecks.clear();
                }
            `;

            const blob = new Blob([workerCode], { type: 'application/javascript' });
            this.worker = new Worker(URL.createObjectURL(blob));
            
            this.worker.onmessage = (e) => this.handleWorkerMessage(e.data);
            this.worker.onerror = (error) => this.handleWorkerInitializationError(error);

        } catch (error) {
            this.initializeBackupStatusChecking();
        }
    }

    handleWorkerMessage({ type, reference, status, data, error }) {
        switch(type) {
            case 'STATUS_UPDATE':
                this.handlePaymentStatusUpdate(reference, status, data);
                break;
            case 'ERROR':
                this.handleWorkerError(reference, error);
                break;
        }
    }

    handleWorkerInitializationError(error) {
        console.error('Worker error:', error);
        this.initializeBackupStatusChecking();
    }

    initializeBackupStatusChecking() {
        console.log('Activating backup status checking');
        this.useBackupChecking = true;
        this.pendingTransactions.forEach((tx, reference) => {
            if (tx.status === 'pending') this.startBackupPaymentCheck(reference);
        });
    }

    startBackupPaymentCheck(reference) {
        const interval = setInterval(async () => {
            try {
                const response = await fetch(
                    `${this.baseUrl}transaction-status?reference=${reference}`,
                    { headers: { 'Authorization': `Basic ${this.credentials}`, 'Cache-Control': 'no-cache' } }
                );
                
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                
                const data = await response.json();
                await this.handlePaymentStatusUpdate(reference, data.status, data);
                
                if (['SUCCESS', 'failed', 'cancelled'].includes(data.status)) {
                    clearInterval(interval);
                    this.activeChecks.delete(reference);
                }
            } catch (error) {
                this.handleBackupCheckError(reference, error);
            }
        }, 5000);

        this.activeChecks.set(reference, interval);
    }

    setupNetworkStatusListener() {
        window.addEventListener('online', () => this.retryFailedOperations());
        window.addEventListener('offline', () => this.pauseAllOperations());
    }

    setupRetryMechanism() {
        setInterval(() => this.retryFailedOperations(), 60000);
    }

    async retryFailedOperations() {
        for (const [key, operation] of this.retryQueue.entries()) {
            if (operation.retries >= this.maxRetries) {
                this.handleMaxRetriesExceeded(key, operation);
                continue;
            }

            try {
                await operation.execute();
                this.retryQueue.delete(key);
            } catch (error) {
                operation.retries++;
            }
        }
    }

    pauseAllOperations() {
        if (this.worker) this.worker.postMessage({ type: 'STOP_ALL' });
        this.activeChecks.forEach(interval => clearInterval(interval));
        this.activeChecks.clear();
    }

    async initializeStorage() {
        try {
            this.loadPendingTransactions();
            this.recoverFailedLogs();
            this.recoverFailedBalanceUpdates();
        } catch (error) {
            console.error('Storage initialization failed:', error);
            this.showToast('Error loading saved data. Please refresh.', 'error');
        }
    }

    loadPendingTransactions() {
        const stored = localStorage.getItem('pendingTransactions');
        if (stored) {
            JSON.parse(stored).forEach(tx => {
                this.pendingTransactions.set(tx.reference, tx);
                if (tx.status === 'pending') this.startPaymentCheck(tx.reference);
            });
        }
    }

    recoverFailedLogs() {
        const failedLogs = localStorage.getItem('failedLogs');
        if (failedLogs) {
            Object.entries(JSON.parse(failedLogs)).forEach(([reference, log]) => {
                this.retryQueue.set(reference, { 
                    execute: () => this.logToRTDB(reference, log.data), 
                    retries: 0 
                });
            });
        }
    }

    recoverFailedBalanceUpdates() {
        const failedUpdates = localStorage.getItem('failedBalanceUpdates');
        if (failedUpdates) {
            JSON.parse(failedUpdates).forEach((update, index) => {
                this.retryQueue.set(`balance_${index}`, {
                    execute: () => this.updateUserBalance(update.amount),
                    retries: 0
                });
            });
        }
    }

    async setupAuthListener() {
        onAuthStateChanged(this.auth, async (user) => {
            if (user) {
                this.currentUser = user;
                await this.fetchUserData();
                this.resumePendingTransactions();
            } else {
                this.handleLogout();
            }
        });
    }

    async fetchUserData() {
        try {
            const userDoc = await getDoc(doc(this.db, 'spinusers', this.currentUser.uid));
            if (userDoc.exists()) {
                this.userId = userDoc.data().userId;
                this.userBalance = userDoc.data().balance || 0;
            }
        } catch (error) {
            console.error('User data fetch failed:', error);
            this.showToast('Error loading user profile.', 'error');
        }
    }

    setupBeforeUnloadHandler() {
        window.addEventListener('beforeunload', () => {
            localStorage.setItem('pendingTransactions', 
                JSON.stringify(Array.from(this.pendingTransactions.values())));
            this.pauseAllOperations();
        });
    }

    handleLogout() {
        this.pauseAllOperations();
        this.clearLocalStorage();
        window.location.href = 'pinlogin.html';
    }

    clearLocalStorage() {
        ['pendingTransactions', 'failedLogs', 'failedBalanceUpdates'].forEach(
            key => localStorage.removeItem(key)
        );
    }

    formatPhoneNumber(phone) {
        phone = phone.replace(/\D/g, '');
        if (phone.length === 9) return '254' + phone;
        if (phone.length === 10 && phone.startsWith('0')) return '254' + phone.slice(1);
        return phone.replace(/^(?:254|\+254|0)(\d{9})$/, '254$1');
    }

    async logToRTDB(reference, data) {
        try {
            const logData = {
                ref: reference,
                email: this.currentUser?.email,
                userId: this.userId,
                userUid: this.currentUser?.uid,
                amount: data.amount,
                phone: data.phone,
                status: data.status,
                timestamp: Date.now(),
                lastUpdated: Date.now()
            };

            await set(ref(this.rtdb, `spinrecharges/${reference}`), logData);
            return true;
        } catch (error) {
            this.storeFailedLog(reference, logData);
            throw error;
        }
    }

    storeFailedLog(reference, data) {
        const failedLogs = JSON.parse(localStorage.getItem('failedLogs') || '{}');
        failedLogs[reference] = { data, timestamp: Date.now() };
        localStorage.setItem('failedLogs', JSON.stringify(failedLogs));
        this.queueRetry(reference, () => this.logToRTDB(reference, data));
    }

    async initiateSTKPush(amount, phone) {
        if (!this.currentUser || !this.userId) {
            throw new Error('Authentication required');
        }

        const formattedPhone = this.formatPhoneNumber(phone);
        if (!formattedPhone.match(/^254\d{9}$/)) {
            throw new Error('Invalid phone number');
        }

        const payload = {
            amount: parseInt(amount),
            phone_number: formattedPhone,
            channel_id: '1487',
            external_reference: `sub_${Date.now()}_${this.userId}`,
            provider: 'm-pesa',
            callback_url: window.location.href
        };

        const response = await fetch(`${this.baseUrl}payments`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${this.credentials}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Payment initiation failed');
        }

        const data = await response.json();
        const transactionData = {
            userId: this.userId,
            userUid: this.currentUser.uid,
            amount: Number(amount),
            phone: formattedPhone,
            status: 'pending',
            reference: data.reference,
            timestamp: Date.now()
        };

        await this.logToRTDB(data.reference, transactionData);
        this.pendingTransactions.set(data.reference, transactionData);
        this.startPaymentCheck(data.reference);

        return { success: true, data };
    }

    startPaymentCheck(reference) {
        if (this.useBackupChecking) {
            this.startBackupPaymentCheck(reference);
            return;
        }

        try {
            this.worker.postMessage({
                type: 'START_CHECK',
                reference,
                credentials: this.credentials,
                baseUrl: this.baseUrl
            });
        } catch (error) {
            console.error('Worker communication failed:', error);
            this.startBackupPaymentCheck(reference);
        }
    }

    async handlePaymentStatusUpdate(reference, status, data) {
        const transaction = this.pendingTransactions.get(reference);
        if (!transaction) return;

        try {
            await update(ref(this.rtdb, `spinrecharges/${reference}`), {
                status,
                lastUpdated: Date.now(),
                ...data
            });

            transaction.status = status;
            transaction.lastChecked = Date.now();
            this.pendingTransactions.set(reference, transaction);
            localStorage.setItem('pendingTransactions', 
                JSON.stringify(Array.from(this.pendingTransactions.values())));

            if (status === 'SUCCESS') {
                await this.handleSuccessfulPayment(transaction);
            } else if (['failed', 'cancelled'].includes(status)) {
                this.handleFailedPayment(reference, status);
            }
        } catch (error) {
            this.handleStatusUpdateError(reference, error);
        }
    }

    async handleSuccessfulPayment(transaction) {
        try {
            await this.updateUserBalance(transaction.amount);
            this.pendingTransactions.delete(transaction.reference);
            this.showToast('Payment successful! Balance updated.', 'success');
            this.dispatchPaymentEvent('paymentSuccess', transaction);
        } catch (error) {
            this.storeFailedBalanceUpdate(transaction);
            this.showToast('Payment received! Balance update pending.', 'warning');
        }
    }

    handleFailedPayment(reference, status) {
        this.pendingTransactions.delete(reference);
        this.showToast(`Payment ${status}. Please try again.`, 'error');
        this.dispatchPaymentEvent('paymentFailed', { reference, status });
    }

    async updateUserBalance(amount) {
        const userRef = doc(this.db, 'spinusers', this.currentUser.uid);
        
        await runTransaction(this.db, async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists()) throw new Error('User not found');
            
            const currentData = userDoc.data();
            const newBalance = (currentData.balance || 0) + Number(amount);
            
            transaction.update(userRef, {
                balance: newBalance,
                lastTransaction: new Date().toISOString(),
                transactionCount: (currentData.transactionCount || 0) + 1,
                lastUpdated: Date.now()
            });

            this.userBalance = newBalance;
        });

        // Verify update
        const verifyDoc = await getDoc(userRef);
        if (verifyDoc.data().balance !== this.userBalance) {
            throw new Error('Balance verification failed');
        }
    }

    storeFailedBalanceUpdate(transaction) {
        const failedUpdates = JSON.parse(localStorage.getItem('failedBalanceUpdates') || '[]');
        failedUpdates.push({ ...transaction, timestamp: Date.now() });
        localStorage.setItem('failedBalanceUpdates', JSON.stringify(failedUpdates));
        this.queueRetry(`balance_${transaction.reference}`, () => this.updateUserBalance(transaction.amount));
    }

    queueRetry(key, operation) {
        this.retryQueue.set(key, { execute: operation, retries: 0 });
    }

    handleWorkerError(reference, error) {
        console.error(`Worker error: ${reference} - ${error}`);
        this.queueRetry(`worker_${reference}`, () => this.startPaymentCheck(reference));
    }

    handleStatusUpdateError(reference, error) {
        console.error(`Status update error: ${reference} - ${error}`);
        const transaction = this.pendingTransactions.get(reference);
        if (transaction) this.queueRetry(`status_${reference}`, () => this.handlePaymentStatusUpdate(reference, transaction.status));
    }

    handleBackupCheckError(reference, error) {
        console.error(`Backup check failed: ${reference} - ${error}`);
        const interval = this.activeChecks.get(reference);
        if (interval) {
            clearInterval(interval);
            this.activeChecks.delete(reference);
        }
    }

    handleMaxRetriesExceeded(key, operation) {
        console.error(`Max retries exceeded for: ${key}`);
        this.showToast('Some operations failed. Contact support.', 'error');
    }

    resumePendingTransactions() {
        this.pendingTransactions.forEach((tx, ref) => {
            if (tx.status === 'pending') this.startPaymentCheck(ref);
        });
    }

    dispatchPaymentEvent(eventName, detail) {
        document.dispatchEvent(new CustomEvent(eventName, {
            detail,
            bubbles: true,
            cancelable: true
        }));
    }

    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        if (!document.getElementById('toastStyles')) {
            const style = document.createElement('style');
            style.id = 'toastStyles';
                        style.textContent = `
                .toast {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    padding: 12px 24px;
                    border-radius: 4px;
                    color: white;
                    z-index: 1000;
                    animation: slideIn 0.3s ease-out;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                    max-width: 350px;
                }
                .toast.success { background-color: #4caf50; }
                .toast.error { background-color: #f44336; }
                .toast.warning { background-color: #ff9800; }
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes fadeOut {
                    from { opacity: 1; }
                    to { opacity: 0; }
                }
                .fade-out {
                    animation: fadeOut 0.3s ease-out forwards;
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Initialize and set up form handling
document.addEventListener('DOMContentLoaded', () => {
    window.paymentProcessor = new PaymentProcessor();

    const form = document.getElementById('stkPushForm');
    const loadingElement = document.getElementById('loading');
    const submitButton = document.getElementById('submitBtn');

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const amount = document.getElementById('amount').value;
            const phone = document.getElementById('phone').value;

            if (!amount || !phone) {
                paymentProcessor.showToast('Please fill in all fields', 'error');
                return;
            }

            submitButton.disabled = true;
            loadingElement.style.display = 'block';

            try {
                await paymentProcessor.initiateSTKPush(amount, phone);
                paymentProcessor.showToast('STK Push sent! Please check your phone.', 'success');
            } catch (error) {
                paymentProcessor.showToast(error.message, 'error');
            } finally {
                submitButton.disabled = false;
                loadingElement.style.display = 'none';
            }
        });
    }

    // Listen for payment events
    document.addEventListener('paymentSuccess', (e) => {
        console.log('Payment successful:', e.detail);
        // Additional success handling if needed
    });

    document.addEventListener('paymentFailed', (e) => {
        console.log('Payment failed:', e.detail);
        // Additional failure handling if needed
    });
});

// Export the PaymentProcessor class
export { PaymentProcessor };