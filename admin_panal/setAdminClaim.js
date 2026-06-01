const admin = require("firebase-admin");

// Path to your service account key JSON file
const serviceAccount = require("./bioatt-attendance-25d06-firebase-adminsdk-fbsvc-8fded6b85d.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Replace with your admin user's UID (find it in Firebase Auth > Users)
const adminUid = "D3XsQxooCOaAYCBtGoVXYyKLjVB3";

admin.auth().setCustomUserClaims(adminUid, { admin: true })
  .then(() => {
    console.log("Admin claim set for UID:", adminUid);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error setting admin claim:", err);
    process.exit(1);
  }); 