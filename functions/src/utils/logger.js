const functions = require("firebase-functions");

function logInfo(message, data) {
  functions.logger.info(message, data);
  console.log("[INFO]", message, data);
}

function logError(message, error) {
  functions.logger.error(message, {error: error.message});
  console.error("[ERROR]", message, error);
}

module.exports = {logInfo, logError};
