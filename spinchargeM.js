
        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
        import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
        import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
        import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

        // Firebase Configuration
        const firebaseConfig = {
            apiKey: "AIzaSyBQ77oIT9KXEzuMy7UcfbojHAr4xxPjW30",
            authDomain: "dataload-6764a.firebaseapp.com",
            databaseURL: "https://dataload-6764a-default-rtdb.firebaseio.com",
            projectId: "dataload-6764a",
            storageBucket: "dataload-6764a.appspot.com",
            messagingSenderId: "84851374553",
            appId: "1:84851374553:web:732c98449acd462a5501c8"
        };

        // Initialize Firebase
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const db = getFirestore(app);
        const rtdb = getDatabase(app);

        // Utility Functions
        function formatAmount(amount) {
            return `KSH ${parseFloat(amount || 0).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            })}`;
        }

        function formatTimestamp(timestamp) {
            if (!timestamp) return 'N/A';
            try {
                const date = new Date(parseInt(timestamp));
                return date.toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                });
            } catch (error) {
                return 'Invalid Date';
            }
        }

        function getStatusBadge(status) {
            const statusClasses = {
                'pending': 'status-badge status-pending',
                'completed': 'status-badge status-completed',
                'approved': 'status-badge status-approved',
                'failed': 'status-badge status-failed',
                'declined': 'status-badge status-declined'
            };
            const className = statusClasses[status?.toLowerCase()] || 'status-badge status-pending';
            return `<span class="${className}">${status || 'pending'}</span>`;
        }

        // Get userId from Firestore
        async function getUserId(uid) {
            try {
                const userDoc = await getDoc(doc(db, 'spinusers', uid));
                return userDoc.exists() ? userDoc.data().userId : null;
            } catch (error) {
                console.error('Error fetching userId:', error);
                return null;
            }
        }

        // Load Transactions
        async function loadTransactions(uid) {
            const transactionList = document.getElementById('transactionList');
            transactionList.innerHTML = '<tr><td colspan="3" class="text-center py-4">Loading...</td></tr>';

            try {
                const userId = await getUserId(uid);
                if (!userId) {
                    throw new Error('User ID not found');
                }

                const spinrechargesRef = ref(rtdb, 'spinrecharges');
                const snapshot = await get(spinrechargesRef);

                if (!snapshot.exists()) {
                    transactionList.innerHTML = `
                        <tr>
                            <td colspan="3" class="text-center py-8">
                                <div class="text-gray-500">
                                    <p class="font-medium">No transactions found</p>
                                    <p class="text-sm">Your transaction history will appear here</p>
                                </div>
                            </td>
                        </tr>
                    `;
                    return;
                }

                const transactions = [];
                snapshot.forEach((child) => {
                    const transaction = child.val();
                    if (transaction && transaction.userId === userId) {
                        transactions.push({
                            id: child.key,
                            ...transaction
                        });
                    }
                });

                if (transactions.length === 0) {
                    transactionList.innerHTML = `
                        <tr>
                            <td colspan="3" class="text-center py-8">
                                <div class="text-gray-500">
                                    <p class="font-medium">No transactions found</p>
                                    <p class="text-sm">Your transaction history will appear here</p>
                                </div>
                            </td>
                        </tr>
                    `;
                    return;
                }

                // Sort by timestamp (newest first)
                transactions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

                const transactionsHTML = transactions.map(transaction => `
                    <tr class="hover:bg-gray-50 transition-colors">
                        <td class="px-4 py-3 font-medium">${formatAmount(transaction.amount)}</td>
                        <td class="px-4 py-3 text-gray-600">${formatTimestamp(transaction.timestamp)}</td>
                        <td class="px-4 py-3">${getStatusBadge(transaction.status)}</td>
                    </tr>
                `).join('');

                transactionList.innerHTML = transactionsHTML;

            } catch (error) {
                console.error('Error:', error);
                transactionList.innerHTML = `
                    <tr>
                        <td colspan="3" class="text-center py-8">
                            <div class="text-red-500">
                                <p class="font-medium">Error loading transactions</p>
                                <button onclick="window.location.reload()" 
                                        class="mt-2 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors">
                                    Try Again
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            }
        }

        // Auth state observer
        onAuthStateChanged(auth, (user) => {
            if (user) {
                loadTransactions(user.uid);
            } else {
                console.log('User is signed out');
                window.parent.postMessage('closeHistoryModal', '*');
            }
        });

        // Error handling for unhandled promises
        window.addEventListener('unhandledrejection', function(event) {
            console.error('Unhandled promise rejection:', event.reason);
        });