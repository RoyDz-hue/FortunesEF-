// Enhanced Anti-Debugging Protection Script
// Version 2.1 - With configurability and reduced false positives

class AntiDebugProtection {
    constructor(config = {}) {
        // Default configuration with more reasonable thresholds
        this.config = {
            redirectURL: config.redirectURL || "https://google.com",
            warningDelay: config.warningDelay || 1000,
            checkInterval: config.checkInterval || 1000,  // Increased to reduce CPU usage
            devToolsThreshold: config.devToolsThreshold || 200,  // Increased to reduce false positives
            debugMessages: config.debugMessages || false,
            enableRedirect: config.enableRedirect ?? true,
            enableRightClick: config.enableRightClick ?? true,
            enableKeyboardShortcuts: config.enableKeyboardShortcuts ?? true,
            enableDevToolsDetection: config.enableDevToolsDetection ?? true
        };

        this.devToolsWarningShown = false;
        this.violationCount = 0;
        this.maxViolations = 3;  // Allow some threshold before taking action
        
        this.initializeProtection();
    }

    initializeProtection() {
        if (this.config.enableRightClick) {
            this.setupRightClickProtection();
        }
        
        if (this.config.enableKeyboardShortcuts) {
            this.setupKeyboardProtection();
        }
        
        if (this.config.enableDevToolsDetection) {
            this.setupDevToolsDetection();
        }

        this.injectProtectiveStyles();
    }

    setupRightClickProtection() {
        document.addEventListener("contextmenu", (event) => {
            // Only prevent right-click on protected elements
            if (this.shouldPreventRightClick(event.target)) {
                event.preventDefault();
                this.handleViolation("Right-click detected");
            }
        });
    }

    shouldPreventRightClick(element) {
        // Allow right-click on form elements and elements with specific class
        return !element.closest('input, textarea, .allow-right-click');
    }

    setupKeyboardProtection() {
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

            if (blockedKeys[event.key] && !this.isExemptElement(event.target)) {
                event.preventDefault();
                this.handleViolation("Keyboard shortcut detected");
            }
        });
    }

    isExemptElement(element) {
        // Allow shortcuts on form elements and elements with specific class
        return element.closest('input, textarea, .allow-shortcuts');
    }

    setupDevToolsDetection() {
        let previousWidth = window.outerWidth;
        let previousHeight = window.outerHeight;

        setInterval(() => {
            const widthDiff = Math.abs(window.outerWidth - window.innerWidth);
            const heightDiff = Math.abs(window.outerHeight - window.innerHeight);
            
            if (widthDiff > this.config.devToolsThreshold || 
                heightDiff > this.config.devToolsThreshold) {
                this.handleViolation("DevTools detected");
            }

            previousWidth = window.outerWidth;
            previousHeight = window.outerHeight;
        }, this.config.checkInterval);
    }

    injectProtectiveStyles() {
        const style = document.createElement("style");
        style.innerHTML = `
            .protected-content {
                -webkit-user-select: none;
                -moz-user-select: none;
                -ms-user-select: none;
                user-select: none;
            }
            
            .allow-select {
                -webkit-user-select: text;
                -moz-user-select: text;
                -ms-user-select: text;
                user-select: text;
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

    handleViolation(reason) {
        this.violationCount++;
        
        if (this.violationCount >= this.maxViolations && !this.devToolsWarningShown) {
            this.devToolsWarningShown = true;
            
            const warning = document.createElement('div');
            warning.className = 'debug-warning';
            warning.textContent = 'Security Violation Detected';
            document.body.appendChild(warning);

            if (this.config.enableRedirect) {
                setTimeout(() => {
                    window.location.href = this.config.redirectURL;
                }, this.config.warningDelay);
            }
        }
    }
}

// Example usage with custom configuration
document.addEventListener('DOMContentLoaded', () => {
    window.antiDebug = new AntiDebugProtection({
        redirectURL: "https://google.com",
        enableRedirect: true,
        devToolsThreshold: 200
    });
});
