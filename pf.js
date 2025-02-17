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
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();
    
    
    // Mask Email (shows only first 3 characters of username)
    function maskEmail(email) {
      const [name, domain] = email.split('@');
      return `${name.substr(0, 3)}***@${domain}`;
    }
    
    // Show Notification
    function showNotification(message, type) {
      const notification = document.createElement('div');
      notification.className = `notification ${type} fade-in`;
      notification.textContent = message;
      document.body.appendChild(notification);
      
      // Trigger fade-in
      setTimeout(() => notification.style.opacity = '1', 100);
      
      // Remove notification after 3 seconds
      setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
      }, 3000);
    }
    
    // Listen for Firebase auth state changes
    auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const userDoc = await db.collection('spinusers').doc(user.uid).get();
          const userData = userDoc.data() || {};
          document.getElementById('userId').textContent = userData.userId || 'N/A';
          document.getElementById('userEmail').textContent = user.email;
          document.getElementById('onboardSince').textContent = userData.memberSince
            ? `Onboard Since: ${new Date(userData.memberSince).toLocaleDateString()}`
            : 'Onboard Since: N/A';
          document.getElementById('amount').textContent = userData.balance ? userData.balance.toFixed(2) : '0.00';
    
          // Generate Referral Link (without file name)
          const domain = window.location.protocol + "//" + window.location.host;
          const referralLink = `${domain}/?ref=${userData.referralCode || ''}`;
          document.getElementById('referralLink').textContent = referralLink;
    
          loadReferrals(userData.userId);
        } catch (error) {
          console.error('Error loading user profile:', error);
          showNotification('Error loading profile', 'error');
        }
      } else {
        window.location.href = 'index.html';
      }
    });
    
    // Load Referrals (levels 1, 2, and 3)
    async function loadReferrals(userId) {
      try {
        const referralsBody = document.getElementById('referralsBody');
        referralsBody.innerHTML = '';
    
        // Fetch Level 1 (Direct Referrals)
        const level1Snapshot = await db.collection('spinusers')
          .where('referredBy', '==', userId)
          .get();
    
        if (level1Snapshot.empty) {
          referralsBody.innerHTML = '<tr><td colspan="3">No referrals found.</td></tr>';
          return;
        }
    
        // Process Level 1 referrals
        for (const doc of level1Snapshot.docs) {
          const userData = doc.data();
          addRowToTable(userData, 1);
    
          // Fetch Level 2 referrals
          const level2Snapshot = await db.collection('spinusers')
            .where('referredBy', '==', userData.userId)
            .get();
    
          for (const doc2 of level2Snapshot.docs) {
            const userData2 = doc2.data();
            addRowToTable(userData2, 2);
    
            // Fetch Level 3 referrals
            const level3Snapshot = await db.collection('spinusers')
              .where('referredBy', '==', userData2.userId)
              .get();
    
            for (const doc3 of level3Snapshot.docs) {
              const userData3 = doc3.data();
              addRowToTable(userData3, 3);
            }
          }
        }
      } catch (error) {
        console.error('Error loading referrals:', error);
        showNotification('Error loading referrals', 'error');
      }
    }
    
    // Append a row to the referrals table
    function addRowToTable(userData, level) {
      const status = userData.balance > 0 ? 'Active' : 'Inactive';
      const earned = calculateEarnings(userData, level);
      const row = `
        <tr>
          <td>${maskEmail(userData.email)}</td>
          <td>${status}</td>
          <td>${earned}</td>
        </tr>
      `;
      document.getElementById('referralsBody').innerHTML += row;
    }
    
    // Calculate earnings based on referral level (example percentages)
    function calculateEarnings(userData, level) {
      const percentages = {1: 0.10, 2: 0.05, 3: 0.02};
      const percentage = percentages[level] || 0;
      return userData.balance ? (userData.balance * percentage).toFixed(2) : '0.00';
    }
    
    // Copy Referral Link functionality with fallback support
    async function copyReferralLink() {
      const referralLink = document.getElementById('referralLink').textContent;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(referralLink);
          showNotification('Referral link copied to clipboard!', 'success');
        } else {
          await fallbackCopyToClipboard(referralLink);
          showNotification('Referral link copied to clipboard!', 'success');
        }
      } catch (err) {
        showNotification('Copy failed! Please try the share options.', 'error');
      }
    }
    
    // Fallback method for copying text to clipboard
    function fallbackCopyToClipboard(text) {
      return new Promise((resolve, reject) => {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
    
        try {
          const successful = document.execCommand('copy');
          document.body.removeChild(textArea);
          successful ? resolve() : reject();
        } catch (err) {
          document.body.removeChild(textArea);
          reject(err);
        }
      });
    }
    
    // Open and close share modal
    function openShareModal() {
      document.getElementById('shareModal').style.display = 'flex';
    }
    
    function closeShareModal() {
      document.getElementById('shareModal').style.display = 'none';
    }
    
    // Share via various platforms
    function shareVia(platform) {
    const referralLink = document.getElementById('referralLink').textContent;
    const shareText = `Check this out: ${referralLink}`;
    
    window.parent.postMessage({
        type: 'share',
        platform,
        link: referralLink,
        text: shareText
    }, '*');
    
    closeShareModal();
    return false;
}
    
    // Close share modal when clicking outside its content
    window.addEventListener('click', function(event) {
      const modal = document.getElementById('shareModal');
      if (event.target === modal) {
        closeShareModal();
      }
    });
    
    // Update Email
    document.getElementById('updateEmailForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const newEmail = document.getElementById('newEmail').value;
  try {
    const user = auth.currentUser;
    await user.updateEmail(newEmail);
    await db.collection('spinusers').doc(user.uid).update({ email: newEmail });
    showNotification('Contact Support for this update', 'info');
  } catch (error) {
    showNotification('Contact Support for this update', 'error');
  }
});
    
    // Update Password
    document.getElementById('updatePasswordForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPassword = document.getElementById('currentPassword').value;
      const newPassword = document.getElementById('newPassword').value;
      try {
        const user = auth.currentUser;
        const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPassword);
        await user.reauthenticateWithCredential(credential);
        await user.updatePassword(newPassword);
        showNotification('Password updated successfully!', 'success');
      } catch (error) {
        showNotification(error.message, 'error');
      }
    });
