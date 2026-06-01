const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

exports.deleteUserAccount = functions.https.onCall(async (data, context) => {
  // Admin check removed for local/testing
  const { uid } = data;
  if (!uid) {
    throw new functions.https.HttpsError("invalid-argument", "UID is required");
  }
  try {
    await admin.auth().deleteUser(uid);
    await admin.firestore().collection("users").doc(uid).delete();
    return { success: true };
  } catch (error) {
    throw new functions.https.HttpsError("internal", error.message);
  }
}); 