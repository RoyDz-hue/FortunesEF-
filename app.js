       export { PaymentProcessor };
        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
        import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
        import { getFirestore, doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
        import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

        const firebaseConfig = {
            apiKey: "AIzaSyBQ77oIT9KXEzuMy7UcfbojHAr4xxPjW30",
            authDomain: "dataload-6764a.firebaseapp.com",
            databaseURL: "https://dataload-6764a-default-rtdb.firebaseio.com",
            projectId: "dataload-6764a",
            storageBucket: "dataload-6764a.appspot.com",
            messagingSenderId: "84851374553",
            appId: "1:84851374553:web:732c98449acd462a5501c8"
        };

        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);
        const rtdb = getDatabase(app);
        const auth = getAuth(app);

        class PaymentProcessor {
            constructor() {
                this.apiUsername = 'hYakRT5HZaNPofgw3LSP';
                this.apiPassword = 'ECsKFTrPKQHdfCa63HPDgMdYS7rXSxaX0GlwBMeW';
                this.baseUrl = 'https://backend.payhero.co.ke/api/v2/';
                this.currentUser = null;

                onAuthStateChanged(auth, (user) => {
                    if (user) {
                        this.currentUser = user;
                    } else {
                        window.location.href = 'login.html';
                    }
                });
            }

            async logToRTDB(reference, data) {
                const rechargeRef = ref(rtdb, `spinrecharges/${reference}`);
                await set(rechargeRef, {
                    ...data,
                    timestamp: Date.now()
                });
            }

            formatPhoneNumber(phone) {
                phone = phone.replace(/\D/g, '');
                if (phone.startsWith('0')) {
                    phone = '254' + phone.substring(1);
                }
                if (phone.startsWith('+254')) {
                    phone = phone.substring(1);
                }
                if (!phone.startsWith('254')) {
                    phone = '254' + phone;
                }
                return phone;
            }

            async initiateSTKPush(amount, phone) {
                if (!this.currentUser) {
                    throw new Error('User not authenticated');
                }

                const credentials = btoa(`${this.apiUsername}:${this.apiPassword}`);
                const formattedPhone = this.formatPhoneNumber(phone);

                const payload = {
                    amount: parseInt(amount),
                    phone_number: formattedPhone,
                    channel_id: '1487',
                    external_reference: 'Subscription',
                    provider: 'm-pesa',
                    callback_url: window.location.href
                };

                try {
                    const response = await fetch(`${this.baseUrl}payments`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Basic ${credentials}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(payload)
                    });

                    const data = await response.json();
                    
                    if (response.ok) {
                        // Log initial pending status to RTDB
                        await this.logToRTDB(data.reference, {
                            userId: this.currentUser.uid,
                            amount: Number(amount),
                            phone: formattedPhone,
                            status: 'pending',
                            reference: data.reference
                        });

                        this.checkTransactionStatus(data.reference, amount);
                        return { success: true, data };
                    } else {
                        throw new Error(data.message || 'Payment failed');
                    }
                } catch (error) {
                    throw error;
                }
            }

            async checkTransactionStatus(reference, amount) {
                const credentials = btoa(`${this.apiUsername}:${this.apiPassword}`);
                let attempts = 0;
                const maxAttempts = 20;
                
                const checkStatus = async () => {
                    try {
                        const response = await fetch(`${this.baseUrl}transaction-status?reference=${reference}`, {
                            headers: {
                                'Authorization': `Basic ${credentials}`
                            }
                        });

                        const data = await response.json();

                        // Update RTDB with current status
                        await this.logToRTDB(reference, {
                            status: data.status,
                            lastChecked: Date.now()
                        });

                        if (data.status === 'completed') {
                            await this.updateUserBalance(amount);
                            this.showToast('Payment successful! Your balance has been updated.', 'success');
                            return;
                        } else if (data.status === 'failed' || data.status === 'cancelled') {
                            this.showToast(`Payment ${data.status}. Please try again.`, 'error');
                            return;
                        } else if (data.status === 'queue') {
                            // Transaction is still being processed
                            if (++attempts < maxAttempts) {
                                setTimeout(checkStatus, 5000);
                            }
                        }
                    } catch (error) {
                        console.error('Status check failed:', error);
                    }
                };

                checkStatus();
            }

            async updateUserBalance(amount) {
                const userRef = doc(db, 'spinusers', this.currentUser.uid);
                
                try {
                    await runTransaction(db, async (transaction) => {
                        const userDoc = await transaction.get(userRef);
                        if (!userDoc.exists()) {
                            throw new Error('User document not found');
                        }

                        const currentData = userDoc.data();
                        const newBalance = (currentData.balance || 0) + Number(amount);
                        
                        transaction.update(userRef, {
                            balance: newBalance,
                            lastTransaction: new Date().toISOString(),
                            transactionCount: (currentData.transactionCount || 0) + 1
                        });
                    });
                } catch (error) {
                    console.error('Error updating balance:', error);
                    throw error;
                }
            }

            showToast(message, type = 'success') {
                const toast = document.createElement('div');
                toast.className = `toast ${type}`;
                toast.textContent = message;
                document.body.appendChild(toast);
                
                setTimeout(() => {
                    toast.remove();
                }, 3000);
            }
        }

        const paymentProcessor = new PaymentProcessor();
        const form = document.getElementById('stkPushForm');
        const loadingElement = document.getElementById('loading');
        const submitButton = document.getElementById('submitBtn');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const amount = document.getElementById('amount').value;
            const phone = document.getElementById('phone').value;
            
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
