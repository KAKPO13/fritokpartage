const functions = require("firebase-functions");
const requestToPay = require("./src/momo/requestToPay");
const {momoCallbackHandler} = require("./src/callbacks/momoCallbackHandler");
const {initiateAndTrackPayment} = require("./src/momo/initiateAndTrackPayment");


exports.requestToPay = functions.https.onRequest(requestToPay);
exports.momoCallback = functions.https.onRequest(momoCallbackHandler);
exports.initiateAndTrackPayment = functions.https.onCall(initiateAndTrackPayment);
