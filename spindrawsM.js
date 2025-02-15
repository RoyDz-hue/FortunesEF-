import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
    import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
    import { getFirestore, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

    const firebaseConfig = {
        apiKey: "AIzaSyBQ77oIT9KXEzuMy7UcfbojHAr4xxPjW30",
        authDomain: "dataload-6764a.firebaseapp.com",
        projectId: "dataload-6764a",
        storageBucket: "dataload-6764a.appspot.com",
        messagingSenderId: "84851374553",
        appId: "1:84851374553:web:732c98449acd462a5501c8"
    };

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    function formatAmount(amount) {
        return `KES ${Number(amount || 0).toLocaleString()}`;
    }

    function formatDate(timestamp) {
        if (!timestamp || !timestamp.seconds) return 'N/A';
        return new Date(timestamp.seconds * 1000).toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function getStatusBadge(status) {
        const statusLower = status.toLowerCase();
        let statusClass = 'status-badge ';
        
        switch (statusLower) {
            case 'pending':
                statusClass += 'status-pending';
                break;
            case 'approved':
            case 'completed':
                statusClass += 'status-approved';
                break;
            case 'failed':
            case 'declined':
                statusClass += 'status-failed';
                break;
            default:
                statusClass += 'status-pending';
        }

        return `<span class="${statusClass}">${status}</span>`;
    }

    async function loadWithdrawals(userId) {
        const transactionList = document.getElementById('transactionList');
        
        try {
            const spinwithdrawalsRef = collection(db, 'spinwithdrawals');
            const q = query(
                spinwithdrawalsRef,
                where('userId', '==', userId)
            );

            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                transactionList.innerHTML = `
                    <tr>
                        <td colspan="3" class="text-center text-gray-500">
                            No withdrawals found
                        </td>
                    </tr>
                `;
                return;
            }

            const withdrawals = [];
            querySnapshot.forEach(doc => {
                withdrawals.push({ 
                    id: doc.id,
                    ...doc.data() 
                });
            });

            withdrawals.sort((a, b) => {
                const timeA = a.timestamp?.seconds || 0;
                const timeB = b.timestamp?.seconds || 0;
                return timeB - timeA;
            });

            const withdrawalsHTML = withdrawals.map(withdrawal => {
                const hasFee = withdrawal.netAmount && withdrawal.netAmount < withdrawal.amount;
                const gasFee = hasFee ? withdrawal.amount - withdrawal.netAmount : 0;
                
                return `
                <tr>
                    <td>
                        <div class="amount-breakdown">
                            <div>${formatAmount(withdrawal.amount)}</div>
                            ${hasFee ? `
                                <div class="fee-line">Gas Fee: -${formatAmount(gasFee)}</div>
                                <div class="net-amount">Receive ${formatAmount(withdrawal.netAmount)}</div>
                            ` : ''}
                        </div>
                    </td>
                    <td>${formatDate(withdrawal.timestamp)}</td>
                    <td>${getStatusBadge(withdrawal.status || 'Pending')}</td>
                </tr>
                `;
            }).join('');

            transactionList.innerHTML = withdrawalsHTML;

        } catch (error) {
            console.error('Error loading withdrawals:', error);
            transactionList.innerHTML = `
                <tr>
                    <td colspan="3" class="text-center text-red-500">
                        Error loading withdrawals. Please try again later.
                    </td>
                </tr>
            `;
        }
    }

    onAuthStateChanged(auth, (user) => {
        if (user) {
            loadWithdrawals(user.uid);
        } else {
            try {
                window.parent.postMessage('closeHistoryModal', '*');
            } catch (error) {
                console.error('Error posting message to parent:', error);
            }
        }
    });

    window.addEventListener('error', (event) => {
        console.error('Global error:', event.error);
        const transactionList = document.getElementById('transactionList');
        if (transactionList) {
            transactionList.innerHTML = `
                <tr>
                    <td colspan="3" class="text-center text-red-500">
                        An error occurred. Please refresh the page and try again.
                    </td>
                </tr>
            `;
        }
    });