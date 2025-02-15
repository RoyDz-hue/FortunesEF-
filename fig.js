// Firebase Configuration and Initialization
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
try {
    firebase.initializeApp(firebaseConfig);
} catch (error) {
    console.error("Firebase initialization error:", error);
}

// Export Firebase services
const auth = firebase.auth();
const db = firebase.firestore();
const rtdb = firebase.database();
const functions = firebase.functions();