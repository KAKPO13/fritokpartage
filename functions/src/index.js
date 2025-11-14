const functions = require("firebase-functions");
  // CommonJS
const requestToPay = require("../momo/requestToPay");
const {initiateAndTrackPayment} = require("./src/momo/initiateAndTrackPayment");
// ✅ correct
const initiateAndTrackPayment = require("../momo/initiateAndTrackPayment");



exports.requestToPay = functions.https.onRequest(requestToPay);
exports.initiateAndTrackPayment = functions.https.onCall(initiateAndTrackPayment);
