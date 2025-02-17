class AntiDebugProtection {
  constructor(config = {}) {
    this.config = {
      redirectURL: config.redirectURL || "https://google.com",
      warningDelay: config.warningDelay || 1000,
      // Whitelist common interactive elements to avoid breaking UI actions.
      whitelistedTags: ['INPUT', 'TEXTAREA', 'SELECT', 'A', 'BUTTON'],
      // Adjust this threshold based on your typical environment.
      dimensionThreshold: config.dimensionThreshold || 200
    };
    this.warningDisplayed = false;
    this.initializeProtection();
  }

  initializeProtection() {
    this.setupRightClickProtection();
    this.setupKeyboardProtection();
    this.setupDevToolsDetection();
  }

  isWhitelisted(element) {
    // Check if the element or one of its parents is in the whitelist.
    return element.closest(this.config.whitelistedTags.join(','));
  }

  setupRightClickProtection() {
    document.addEventListener("contextmenu", (event) => {
      if (this.isWhitelisted(event.target)) return true;
      event.preventDefault();
      this.handleWarning("Right-click disabled");
    });
  }

  setupKeyboardProtection() {
    document.addEventListener("keydown", (event) => {
      // Block F12
      if (event.key === "F12") {
        event.preventDefault();
        this.handleWarning("F12 disabled");
        return;
      }
      // Block Ctrl+Shift+I, Ctrl+Shift+J and Ctrl+U
      if (
        (event.ctrlKey && event.shiftKey && (event.key === "I" || event.key === "J")) ||
        (event.ctrlKey && event.key === "U")
      ) {
        event.preventDefault();
        this.handleWarning("Developer shortcut blocked");
      }
    });
  }

  setupDevToolsDetection() {
    // Method 1: Window dimension check
    setInterval(() => {
      const { dimensionThreshold } = this.config;
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;

      if (!this.warningDisplayed && (widthDiff > dimensionThreshold || heightDiff > dimensionThreshold)) {
        this.handleWarning("Developer tools detected (window dimensions)");
        this.warningDisplayed = true;
        // Optional: Uncomment to redirect
        // window.location.href = this.config.redirectURL;
      }
    }, 500);

    // Method 2: Console getter trick
    const element = new Image();
    Object.defineProperty(element, 'id', {
      get: () => {
        if (!this.warningDisplayed) {
          this.handleWarning("Developer tools detected (console inspection)");
          this.warningDisplayed = true;
          // Optional: Uncomment to redirect
          // window.location.href = this.config.redirectURL;
        }
      }
    });

    // Log the element repeatedly.
    setInterval(() => {
      console.log(element);
    }, 1000);
  }

  getSarcasticMessage(message) {
    if (message.includes("Right-click disabled")) {
      return "Oh dear, trying to sneak a right-click? Our chat is way more fun! 🤭💬";
    } else if (message.includes("F12 disabled")) {
      return "Hi esteemed user! 🤗 Have a question? You can reach us through the chat 😌 we connect!";
    } else if (message.includes("Developer shortcut blocked")) {
      return "Oops, caught you with a secret key combo! How about chatting with us instead? 😉💬";
    } else if (message.includes("Developer tools detected (window dimensions)")) {
      return "Aha! We see you're resizing like a pro. Fancy a chat instead of peeking? 😇💻";
    } else if (message.includes("Developer tools detected (console inspection)")) {
      return "Caught you peeking into our console! No worries, our chat is even more interesting 😏💬";
    } else {
      return "Hi esteemed user! 🤗 Have a question? You can reach us through the chat 😌 we connect!";
    }
  }

  handleWarning(message) {
    const sarcasticMessage = this.getSarcasticMessage(message);
    console.warn("Security Notice:", sarcasticMessage);
    
    // Display a non-intrusive on-screen warning.
    const warning = document.createElement('div');
    warning.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.8);
      color: #f1f1f1;
      padding: 10px 20px;
      border-radius: 5px;
      font-size: 14px;
      z-index: 9999;
      pointer-events: none;
    `;
    warning.textContent = sarcasticMessage;
    document.body.appendChild(warning);

    setTimeout(() => {
      warning.remove();
    }, 3000);
  }
}

window.addEventListener('load', () => {
  window.antiDebug = new AntiDebugProtection({
    redirectURL: "https://google.com"
    // You can also adjust dimensionThreshold here if needed.
  });
});
