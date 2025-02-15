// Firebase imports
    import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
    import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
    import { getFirestore, doc, runTransaction, onSnapshot, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
    import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

    // Firebase configuration
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
    const rtdb = getDatabase(app);

    const Game = {
        currentUser: null,
        balance: 0,
        activeGame: 'wheel',
        wheelState: { spinning: false },
        boxState: { active: false },
        boxesLocked: false,  // New property to track if boxes are locked
        transactionQueue: Promise.resolve(),
        lastGameTimestamp: 0,
        settings: null,

        // Game configuration
        config: {
            minStake: 10,
            maxStake: 1000,
            cooldownPeriod: 1000,
            wheelSegments: [
                { multiplier: 0, probability: 0.30 },
                { multiplier: 0.1, probability: 0.20 },
                { multiplier: 0.25, probability: 0.15 },
                { multiplier: 0.5, probability: 0.12 },
                { multiplier: 0.9, probability: 0.08 },
                { multiplier: 1, probability: 0.06 },
                { multiplier: 1.25, probability: 0.04 },
                { multiplier: 1.5, probability: 0.03 },
                { multiplier: 1.75, probability: 0.015 },
                { multiplier: 2, probability: 0.005 }
            ],
            boxCount: 6,
            difficultyRanges: {
                Hard: { min: 0, max: 0.9 },
                Medium: { min: 1.0, max: 1.9 },
                Easy: { min: 2.0, max: 3.0 }
            },
            boxMultipliers: Array.from({ length: 31 }, (_, i) => ({
                multiplier: +(i / 10).toFixed(1),
                probability: 1 / 31
            }))
        },

        init() {
            this.bindEvents();
            this.initAuth();
            this.initGames();
            this.setupErrorHandling();
            this.initializeRTDBListeners();
        },

        initializeRTDBListeners() {
            const settingsRef = ref(rtdb, 'settings');
            onValue(settingsRef, (snapshot) => {
                if (snapshot.exists()) {
                    this.settings = snapshot.val();
                    console.log('Settings updated:', this.settings);
                }
            });
        },

        getCurrentDifficultyRange() {
            if (!this.settings) return this.config.difficultyRanges.Medium;

            const { Hard, Medium, Easy } = this.settings;
            if (Hard) return this.config.difficultyRanges.Hard;
            if (Medium) return this.config.difficultyRanges.Medium;
            if (Easy) return this.config.difficultyRanges.Easy;

            return this.config.difficultyRanges.Medium;
        },

        generateEasyMultiplier() {
            const easyRange = this.config.difficultyRanges.Easy;
            const multiplier = (
                Math.random() * (easyRange.max - easyRange.min) + easyRange.min
            ).toFixed(1);
            return parseFloat(multiplier);
        },

        bindEvents() {
    document.querySelectorAll('.game-selector button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            this.showGame(e.target.dataset.game);
            btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

            document.querySelectorAll('.stake-button').forEach(btn => {
                btn.addEventListener('click', () => {
                    const amount = parseInt(btn.dataset.amount);
                    this.setStake(amount);
                });
            });

            document.getElementById('spinButton')?.addEventListener('click', () => this.spin());

            document.querySelectorAll('.gift-box').forEach((box, index) => {
                box.addEventListener('click', () => this.selectBox(index));
            });
        },

        async initAuth() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            this.currentUser = user;
            const userRef = doc(db, 'spinusers', user.uid);
            onSnapshot(userRef, (doc) => {
                if (doc.exists()) {
                    this.balance = doc.data().balance || 0;
                    document.getElementById('userBalance').textContent = this.balance.toFixed(2);
                } else {
                    this.balance = 0;
                    document.getElementById('userBalance').textContent = "0.00";
                }
            });
        } else {
            window.location.href = 'pinlogin.html';
        }
    });
},

        initGames() {
            this.initWheel();
            this.resetBoxes();
        },

        initWheel() {
            document.getElementById('wheel').style.transform = 'rotate(0deg)';
        },

        async selectBox(index) {
            // Check if boxes are locked
            if (this.boxesLocked) return;
            if (this.boxState.active || !this.checkCooldown()) return;

            const stake = parseInt(document.getElementById('stakeAmount').value);
            if (!this.validateStake(stake)) return;

            try {
                this.boxState.active = true;
                await this.updateBalance(-stake);

                const box = document.querySelectorAll('.gift-box')[index];
                const multiplierDisplay = box.querySelector('.multiplier-value');

                // First just open the box
                box.classList.add('opened');

                setTimeout(async () => {
                    const result = this.getBoxResult();
                    const winnings = stake * result.multiplier;

                    // Display the multiplier
                    multiplierDisplay.textContent = `${result.multiplier.toFixed(1)}x`;

                    if (result.multiplier > 0) {
                        box.classList.add('winner');
                        await this.updateBalance(winnings);
                        this.showResult(`🎉 Won Sh${winnings.toFixed(2)} (${result.multiplier}x)!`, 'success');
                    } else {
                        multiplierDisplay.textContent = '❌';
                        this.showResult('❌ Try again!', 'error');
                    }

                    // Lock the boxes and reveal remaining ones
                    this.boxesLocked = true;
                    setTimeout(() => {
                        this.revealRemainingBoxes(index);
                    }, 1000);

                }, 500);
            } catch (error) {
                this.handleError(error);
            } finally {
                setTimeout(() => {
                    this.boxState.active = false;
                    this.lastGameTimestamp = Date.now();
                }, 500);
            }
        },

        revealRemainingBoxes(selectedIndex) {
            const boxes = document.querySelectorAll('.gift-box');

            boxes.forEach((box, index) => {
                if (index !== selectedIndex) {
                    setTimeout(() => {
                        const easyMultiplier = this.generateEasyMultiplier();
                        const multiplierDisplay = box.querySelector('.multiplier-value');

                        // Set multiplier before opening
                        multiplierDisplay.textContent = `${easyMultiplier.toFixed(1)}x`;
                        
                        // Open box with animation
                        box.classList.add('opened');

                    }, index * 300);
                }
            });

            // Add continue button after all boxes are revealed
            setTimeout(() => {
                if (!document.querySelector('.continue-btn')) {
                    const continueBtn = document.createElement('button');
                    continueBtn.className = 'continue-btn spin-button';
                    continueBtn.textContent = 'Continue Playing';
                    continueBtn.onclick = () => {
                        this.resetBoxes();
                        this.boxesLocked = false;  // Unlock boxes when continuing
                    };
                    document.querySelector('.boxes-container').after(continueBtn);
                }
            }, (boxes.length * 300) + 500);
        },

        resetBoxes() {
            document.querySelectorAll('.gift-box').forEach(box => {
                box.classList.remove('opened', 'winner');
                const multiplierDisplay = box.querySelector('.multiplier-value');
                if (multiplierDisplay) {
                    multiplierDisplay.textContent = '';
                }
            });
            const continueBtn = document.querySelector('.continue-btn');
            if (continueBtn) continueBtn.remove();
        },

        showGame(game) {
    // Hide all game sections
    document.querySelectorAll('.game-content').forEach(section => {
        section.style.display = 'none';
    });

    // Show the selected game
    const selectedGame = document.getElementById(game + 'Game');
    if (selectedGame) {
        selectedGame.style.display = 'block';
    }
},

        setStake(amount) {
            const input = this.activeGame === 'wheel' 
                ? document.getElementById('customStake') 
                : document.getElementById('stakeAmount');
            const value = Math.min(Math.max(amount, this.config.minStake), this.config.maxStake);
            if (input) input.value = value;
        },

        async spin() {
            if (this.wheelState.spinning || !this.checkCooldown()) return;

            const stake = parseInt(document.getElementById('customStake').value);
            if (!this.validateStake(stake)) return;

            try {
                this.wheelState.spinning = true;
                document.getElementById('spinButton').disabled = true;

                await this.updateBalance(-stake);
                const multiplier = await this.spinWheel();
                const winnings = stake * multiplier;

                if (multiplier > 0) {
                    await this.updateBalance(winnings);
                    this.showResult(`🎉 Won Sh${winnings.toFixed(2)} (${multiplier}x)!`, 'success');
                } else {
                    this.showResult('❌ Try again!', 'error');
                }
            } catch (error) {
                this.handleError(error);
            } finally {
                this.wheelState.spinning = false;
                document.getElementById('spinButton').disabled = false;
                this.lastGameTimestamp = Date.now();
            }
        },

        async spinWheel() {
            return new Promise((resolve) => {
                const random = Math.random();
                let cumulativeProbability = 0;
                let selectedSegment = this.config.wheelSegments[0];

                for (const segment of this.config.wheelSegments) {
                    cumulativeProbability += segment.probability;
                    if (random <= cumulativeProbability) {
                        selectedSegment = segment;
                        break;
                    }
                }

                const wheel = document.getElementById('wheel');
                const segmentIndex = this.config.wheelSegments.indexOf(selectedSegment);
                const baseRotation = segmentIndex * 36;
                const randomOffset = Math.random() * 36;
                const extraRotations = 5 + Math.floor(Math.random() * 5);
                const finalRotation = (extraRotations * 360) + baseRotation + randomOffset;

                wheel.style.transition = 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
                wheel.style.transform = `rotate(${finalRotation}deg)`;

                setTimeout(() => {
                    resolve(selectedSegment.multiplier);
                }, 4100);
            });
        },

        getBoxResult() {
            const range = this.getCurrentDifficultyRange();
            const availableMultipliers = this.config.boxMultipliers.filter(m => 
                m.multiplier >= range.min && m.multiplier <= range.max
            );

            const multiplier = availableMultipliers[Math.floor(Math.random() * availableMultipliers.length)];
            return multiplier || { multiplier: 0, probability: 1 };
        },

        async updateBalance(amount) {
            return this.transactionQueue = this.transactionQueue.then(async () => {
                const userRef = doc(db, 'spinusers', this.currentUser.uid);

                try {
                    await runTransaction(db, async (transaction) => {
                        const doc = await transaction.get(userRef);
                        if (!doc.exists()) throw new Error("User not found");

                        const newBalance = doc.data().balance + amount;
                        if (newBalance < 0) throw new Error("Insufficient balance");

                        transaction.update(userRef, { 
                            balance: newBalance,
                            lastUpdate: serverTimestamp()
                        });

                        const transactionRef = collection(db, 'transactions');
                        await addDoc(transactionRef, {
                            userId: this.currentUser.uid,
                            amount,
                            type: amount > 0 ? 'win' : 'stake',
                            game: this.activeGame,
                            timestamp: serverTimestamp()
                        });
                    });
                } catch (error) {
                    this.handleError(error);
                    throw error;
                }
            });
        },

        validateStake(stake) {
            if (isNaN(stake) || stake < this.config.minStake || stake > this.config.maxStake) {
                this.showResult(`⚠️ Stake must be between Sh${this.config.minStake}-Sh${this.config.maxStake}`, 'error');
                return false;
            }
            if (stake > this.balance) {
                this.showResult('⚠️ Insufficient balance', 'error');
                return false;
            }
            return true;
        },

        checkCooldown() {
            const now = Date.now();
            if (now - this.lastGameTimestamp < this.config.cooldownPeriod) {
                this.showResult('Please wait before playing again', 'error');
                return false;
            }
            return true;
        },

        showResult(message, type) {
            const modal = document.getElementById('resultModal');
            const title = document.getElementById('resultTitle');
            const msg = document.getElementById('resultMessage');

            title.textContent = type === 'success' ? 'Congratulations!' : 'Oops!';
            title.style.color = type === 'success' ? '#4CAF50' : '#ff6b6b';
            msg.textContent = message;
            modal.classList.add('show');

            setTimeout(() => modal.classList.remove('show'), 3000);
        },

        setupErrorHandling() {
            window.addEventListener('error', (event) => this.handleError(event.error));
            window.addEventListener('unhandledrejection', (event) => this.handleError(event.reason));
        },

        handleError(error) {
            console.error('Game error:', error);
            this.wheelState.spinning = false;
            this.boxState.active = false;
            document.getElementById('spinButton')?.removeAttribute('disabled');
            this.showResult('An error occurred. Please try again.', 'error');
        },

        closeModal() {
            document.getElementById('resultModal').classList.remove('show');
        }
    };

    // Initialize game when DOM is ready
    document.addEventListener('DOMContentLoaded', () => Game.init());