const functions = require("firebase-functions");
const requestToPay = require("./src/momo/requestToPay");
const {initiateAndTrackPayment} = require("./src/momo/initiateAndTrackPayment");


exports.requestToPay = functions.https.onRequest(requestToPay);
exports.initiateAndTrackPayment = functions.https.onCall(initiateAndTrackPayment);
