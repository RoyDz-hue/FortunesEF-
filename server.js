
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const axios = require("axios");
const serviceAccount = require("./attached_assets/firebaseAdminSDK.json");

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://dataload-6764a-default-rtdb.firebaseio.com",
});

const db = admin.firestore();
const rtdb = admin.database();
const app = express();
app.use(express.json());
app.use(cors());

const API_USERNAME = "hYakRT5HZaNPofgw3LSP";
const API_PASSWORD = "ECsKFTrPKQHdfCa63HPDgMdYS7rXSxaX0GlwBMeW";
const BASE_URL = "https://backend.payhero.co.ke/api/v2/";

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ status: "Server is running" });
});

// Route to Initiate STK Push
app.post("/initiate-stk", async (req, res) => {
  const { amount, phone, userId } = req.body;

  if (!amount || !phone || !userId) {
    return res.status(400).json({ success: false, error: "Missing required fields" });
  }

  try {
    const credentials = Buffer.from(`${API_USERNAME}:${API_PASSWORD}`).toString("base64");
    const formattedPhone = phone.replace(/\D/g, "").replace(/^0/, "254");

    const payload = {
      amount: parseInt(amount),
      phone_number: formattedPhone,
      channel_id: "1487",
      external_reference: "Subscription",
      provider: "m-pesa",
      callback_url: "https://your-backend-url.com/callback",
    };

    const response = await axios.post(`${BASE_URL}payments`, payload, {
      headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
    });

    if (response.data && response.data.reference) {
      // Log transaction to Firebase RTDB
      await rtdb.ref(`spinrecharges/${response.data.reference}`).set({
        userId,
        amount: Number(amount),
        phone: formattedPhone,
        status: "pending",
        reference: response.data.reference,
        timestamp: Date.now(),
      });

      res.json({ success: true, reference: response.data.reference });
    } else {
      throw new Error("STK Push failed");
    }
  } catch (error) {
    console.error("STK Push Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route to Check Payment Status
app.get("/check-status/:reference", async (req, res) => {
  const { reference } = req.params;

  if (!reference) {
    return res.status(400).json({ success: false, error: "Reference is required" });
  }

  try {
    const credentials = Buffer.from(`${API_USERNAME}:${API_PASSWORD}`).toString("base64");
    const response = await axios.get(`${BASE_URL}transaction-status?reference=${reference}`, {
      headers: { Authorization: `Basic ${credentials}` },
    });

    const status = response.data.status;

    // Update RTDB
    await rtdb.ref(`spinrecharges/${reference}`).update({ status });

    if (status === "completed") {
      const snapshot = await rtdb.ref(`spinrecharges/${reference}`).once("value");
      const { userId, amount } = snapshot.val();

      // Update Firestore user balance
      const userRef = db.collection("spinusers").doc(userId);
      await userRef.update({ 
        balance: admin.firestore.FieldValue.increment(amount),
        lastRecharge: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    res.json({ success: true, status });
  } catch (error) {
    console.error("Status Check Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: "Internal server error" });
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Server started successfully');
});
