// Non-Blocking Anti-Debug Protection
// Works with existing HTML without modifications

class AntiDebugProtection {
    constructor(config = {}) {
        this.config = {
            redirectURL: config.redirectURL || "https://google.com",
            warningDelay: config.warningDelay || 1000,
            // Whitelist common interactive elements
            whitelistedTags: ['INPUT', 'TEXTAREA', 'SELECT', 'A', 'BUTTON']
        };
        
        this.initializeProtection();
    }

    initializeProtection() {
        this.setupRightClickProtection();
        this.setupKeyboardProtection();
        this.setupDevToolsDetection();
    }

    isWhitelisted(element) {
        // Check if element or its parents are whitelisted
        return element.closest(this.config.whitelistedTags.join(',')) !== null;
    }

    setupRightClickProtection() {
        document.addEventListener("contextmenu", (event) => {
            // Allow right-click on form elements and links
            if (this.isWhitelisted(event.target)) {
                return true;
            }
            
            event.preventDefault();
            this.handleWarning("Right-click disabled");
        });
    }

    setupKeyboardProtection() {
        document.addEventListener("keydown", (event) => {
            // Only block debug-related shortcuts
            const blockedCombos = {
                "F12": true,
                "I": event.ctrlKey && event.shiftKey, // Ctrl+Shift+I
                "J": event.ctrlKey && event.shiftKey, // Ctrl+Shift+J
                "U": event.ctrlKey  // Ctrl+U
            };

            if (blockedCombos[event.key]) {
                event.preventDefault();
                this.handleWarning("Developer shortcut blocked");
            }
        });
    }

    setupDevToolsDetection() {
        let warningDisplayed = false;
        
        setInterval(() => {
            const threshold = 160;
            const widthDiff = window.outerWidth - window.innerWidth;
            const heightDiff = window.outerHeight - window.innerHeight;
            
            if (!warningDisplayed && (widthDiff > threshold || heightDiff > threshold)) {
                this.handleWarning("Developer tools detected");
                warningDisplayed = true;
            }
        }, 1000);
    }

    handleWarning(message) {
        console.warn("Security Notice:", message);
        
        // Optional: Add a non-intrusive warning
        const warning = document.createElement('div');
        warning.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            font-size: 14px;
            z-index: 9999;
            pointer-events: none;
        `;
        warning.textContent = message;
        document.body.appendChild(warning);
        
        setTimeout(() => {
            warning.remove();
        }, 3000);
    }
}

// Initialize protection
window.addEventListener('load', () => {
    window.antiDebug = new AntiDebugProtection({
        redirectURL: "https://google.com"
    });
});
