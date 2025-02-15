// Advanced Anti-Debugging Protection Script
// Version 2.0

// Configuration
const CONFIG = {
    redirectURL: "https://google.com",
    warningDelay: 1000,
    checkInterval: 500,
    devToolsThreshold: 160,
    debugMessages: false
};

class AntiDebugProtection {
    constructor() {
        this.devToolsWarningShown = false;
        this.initializeProtection();
    }

    initializeProtection() {
        this.disableRightClick();
        this.disableKeyboardShortcuts();
        this.injectProtectiveStyles();
        this.startDevToolsDetection();
        this.setupConsoleProtection();
        this.setupSourceProtection();
    }

    disableRightClick() {
        document.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            this.handleViolation("Right-click detected");
        });
    }

    disableKeyboardShortcuts() {
        document.addEventListener("keydown", (event) => {
            const blockedKeys = {
                "F12": true,
                "I": event.ctrlKey && event.shiftKey,
                "J": event.ctrlKey && event.shiftKey,
                "C": event.ctrlKey && event.shiftKey,
                "U": event.ctrlKey,
                "S": event.ctrlKey,
                "P": event.ctrlKey
            };

            if (blockedKeys[event.key]) {
                event.preventDefault();
                this.handleViolation("Keyboard shortcut detected");
            }
        });
    }

    injectProtectiveStyles() {
        const style = document.createElement("style");
        style.innerHTML = `
            * {
                -webkit-touch-callout: none;
                -webkit-user-select: none;
                -moz-user-select: none;
                -ms-user-select: none;
                user-select: none;
            }
            
            input, textarea {
                -webkit-user-select: text;
                -moz-user-select: text;
                -ms-user-select: text;
                user-select: text;
                pointer-events: auto !important;
            }
            
            a, button, select {
                pointer-events: auto !important;
            }
            
            .debug-warning {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.9);
                color: #ff0000;
                padding: 20px;
                border-radius: 10px;
                font-size: 24px;
                z-index: 999999;
            }
        `;
        document.head.appendChild(style);
    }

    startDevToolsDetection() {
        let previousWidth = window.outerWidth;
        let previousHeight = window.outerHeight;

        setInterval(() => {
            // Size-based detection
            const widthDiff = Math.abs(window.outerWidth - window.innerWidth);
            const heightDiff = Math.abs(window.outerHeight - window.innerHeight);
            
            // Movement detection
            const hasWidthChanged = window.outerWidth !== previousWidth;
            const hasHeightChanged = window.outerHeight !== previousHeight;
            
            if (
                widthDiff > CONFIG.devToolsThreshold || 
                heightDiff > CONFIG.devToolsThreshold ||
                (hasWidthChanged && hasHeightChanged)
            ) {
                this.handleViolation("DevTools detected");
            }

            previousWidth = window.outerWidth;
            previousHeight = window.outerHeight;
        }, CONFIG.checkInterval);
    }

    setupConsoleProtection() {
        const protectedConsoleMethods = ['log', 'info', 'warn', 'error', 'debug', 'clear'];
        
        protectedConsoleMethods.forEach(method => {
            console[method] = (...args) => {
                if (!CONFIG.debugMessages) {
                    this.handleViolation("Console interaction detected");
                }
            };
        });

        // Additional console detection
        setInterval(() => {
            const consoleTest = /./;
            consoleTest.toString = () => {
                this.handleViolation("Console test detected");
                return 'Console test';
            };
        }, CONFIG.checkInterval);
    }

    setupSourceProtection() {
        // Debugger trap (used sparingly to avoid performance issues)
        setInterval(() => {
            if (this.devToolsWarningShown) {
                (() => {
                    debugger;
                })();
            }
        }, 100);

        // Source protection
        (() => {
            function containsStack(error) {
                return error.stack && error.stack.toString().includes('toString');
            }

            const handler = {
                get: (target, prop) => {
                    try {
                        throw new Error();
                    } catch (error) {
                        if (containsStack(error)) {
                            this.handleViolation("Source inspection detected");
                        }
                    }
                    return target[prop];
                }
            };

            window.eval = new Proxy(window.eval, handler);
        })();
    }

    handleViolation(reason) {
        if (this.devToolsWarningShown) return;
        
        this.devToolsWarningShown = true;
        
        // Create warning element
        const warning = document.createElement('div');
        warning.className = 'debug-warning';
        warning.textContent = 'Security Violation Detected';
        document.body.appendChild(warning);

        // Redirect after delay
        setTimeout(() => {
            window.location.href = CONFIG.redirectURL;
        }, CONFIG.warningDelay);
    }
}

// Initialize protection when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.antiDebug = new AntiDebugProtection();
});

// Immediate initialization if DOM is already loaded
if (document.readyState === 'complete') {
    window.antiDebug = new AntiDebugProtection();
}