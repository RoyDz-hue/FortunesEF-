// Generate User ID
function generateUserId() {
    return 'a' + Math.random().toString(36).substr(2, 4) + 'k';
}

// Validate Referral Code
async function validateReferralCode(referralCode) {
    if (!referralCode) return true;

    try {
        const querySnapshot = await db.collection('spinusers')
            .where('referralCode', '==', referralCode.trim())
            .limit(1)
            .get();
        
        if (querySnapshot.empty) {
            console.log('No matching referral code found:', referralCode);
            return false;
        }
        return true;
    } catch (error) {
        console.error("Error validating referral code:", error);
        throw error;
    }
}

// Save User Data
async function saveUserData(uid, email, referralCode) {
    try {
        // First, verify if the referral code exists (if provided)
        let referrerData = null;
        if (referralCode) {
            const referrerSnapshot = await db.collection('spinusers')
                .where('referralCode', '==', referralCode.trim())
                .limit(1)
                .get();

            if (!referrerSnapshot.empty) {
                referrerData = {
                    id: referrerSnapshot.docs[0].id,
                    ...referrerSnapshot.docs[0].data()
                };
            } else {
                console.warn('Referral code not found:', referralCode);
            }
        }

        const userId = generateUserId();
        const userData = {
            email: email,
            userId: userId,
            referralCode: userId,
            memberSince: new Date().toISOString(),
            referredBy: referrerData ? referralCode : null,
            referrerUid: referrerData ? referrerData.id : null,
            referralCount: 0
        };

        // Save the new user's data
        await db.collection('spinusers').doc(uid).set(userData);

        // Update referrer's count if exists
        if (referrerData) {
            const referrerRef = db.collection('spinusers').doc(referrerData.id);
            await referrerRef.update({
                referralCount: firebase.firestore.FieldValue.increment(1)
            });

            // Log the successful referral update
            console.log('Updated referrer count for:', referrerData.id);
        }

        // Verify the save was successful
        const savedUserDoc = await db.collection('spinusers').doc(uid).get();
        if (!savedUserDoc.exists) {
            throw new Error('Failed to verify user data creation');
        }

        return userData;

    } catch (error) {
        console.error("Error in saveUserData:", error);
        throw error;
    }
}

// Display Alert
function showAlert(message, type = 'error', timeout = 3000) {
    const alertElement = document.createElement('div');
    alertElement.className = `alert ${type}`;
    alertElement.textContent = message;
    document.body.appendChild(alertElement);
    setTimeout(() => alertElement.remove(), timeout);
}

// Handle Registration
async function handleRegistration(email, password, referralCode) {
    const errorElement = document.getElementById('registerError');
    const successElement = document.getElementById('registerSuccess');
    let userCredential = null;

    try {
        errorElement.textContent = '';
        errorElement.style.display = 'none';
        successElement.textContent = 'Creating account...';
        successElement.style.display = 'block';

        // Validate referral code if provided
        if (referralCode) {
            const isValidReferral = await validateReferralCode(referralCode);
            if (!isValidReferral) {
                throw new Error('Invalid referral code');
            }
        }

        // Create user account
        userCredential = await auth.createUserWithEmailAndPassword(email, password);

        // Save user data with referral information
        await saveUserData(userCredential.user.uid, email, referralCode);

        // Final verification
        const finalCheck = await db.collection('spinusers').doc(userCredential.user.uid).get();
        if (!finalCheck.exists) {
            throw new Error('Final verification failed');
        }

        successElement.textContent = 'Registration successful! Redirecting...';
        setTimeout(() => window.location.href = 'pinpa.html', 2000);

    } catch (error) {
        let errorMessage = 'Registration failed. Please try again.';
        
        if (error.message === 'Invalid referral code') {
            errorMessage = 'Invalid referral code. Please check and try again.';
        } else if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'Email is already in use.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email address.';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password should be at least 6 characters long.';
        }

        errorElement.textContent = errorMessage;
        errorElement.style.display = 'block';
        successElement.style.display = 'none';
        
        // Cleanup if registration fails
        if (userCredential?.user) {
            try {
                await userCredential.user.delete();
            } catch (deleteError) {
                console.error("Cleanup failed:", deleteError);
            }
        }
    }
}

// Handle Login
async function handleLogin(email, password) {
    const errorElement = document.getElementById('loginError');
    
    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        
        // Check if user data exists
        const userDoc = await db.collection('spinusers').doc(userCredential.user.uid).get();
        
        if (!userDoc.exists) {
            // Create user data if it doesn't exist
            await saveUserData(userCredential.user.uid, email, null);
            
            // Verify the data was created
            const verifyDoc = await db.collection('spinusers').doc(userCredential.user.uid).get();
            if (!verifyDoc.exists) {
                throw new Error('User data verification failed');
            }
        }
        
        window.location.href = 'pinpa.html';
    } catch (error) {
        let errorMessage = 'Login failed. Please try again.';
        
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
            errorMessage = 'Invalid email or password.';
        } else if (error.code === 'auth/user-not-found') {
            errorMessage = 'User not found. Please register.';
        }
        
        errorElement.textContent = errorMessage;
        errorElement.style.display = 'block';
    }
}

// Event Listeners
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const referralCode = document.getElementById('referralCode').value.trim();

    if (password.length < 6) {
        showAlert('Password should be at least 6 characters long.', 'error');
        return;
    }

    if (password !== confirmPassword) {
        showAlert('Passwords do not match.', 'error');
        return;
    }

    await handleRegistration(email, password, referralCode);
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    await handleLogin(email, password);
});

// Navigation Functions
function showSection(sectionToShow) {
    document.querySelectorAll('.form-section').forEach(section => {
        section.classList.remove('active');
    });
    sectionToShow.classList.add('active');
}

// Navigation Event Listeners
document.getElementById('showRegister').addEventListener('click', () => {
    showSection(document.getElementById('registerSection'));
});

document.getElementById('showLogin').addEventListener('click', () => {
    showSection(document.getElementById('loginSection'));
});

document.getElementById('showForgotPassword').addEventListener('click', () => {
    showSection(document.getElementById('forgotPasswordSection'));
});

document.getElementById('backToLogin').addEventListener('click', () => {
    showSection(document.getElementById('loginSection'));
});

// Handle Referral Code from URL
const urlParams = new URLSearchParams(window.location.search);
const referralCode = urlParams.get('ref');
if (referralCode) {
    const referralInput = document.getElementById('referralCode');
    referralInput.value = referralCode;
    referralInput.readOnly = true;
    showSection(document.getElementById('registerSection'));
}

// Auth State Observer
auth.onAuthStateChanged(async (user) => {
    if (user) {
        try {
            const userDoc = await db.collection('spinusers').doc(user.uid).get();
            if (!userDoc.exists) {
                await saveUserData(user.uid, user.email, null);
            }
            window.location.href = 'pinpa.html';
        } catch (error) {
            console.error("Auth state check error:", error);
            showAlert('Error checking authentication state', 'error');
        }
    }
});