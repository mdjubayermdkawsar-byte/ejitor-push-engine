const admin = require('firebase-admin');
const path = require('path');

if (!admin.apps.length) {
  const serviceAccount = require(path.join(process.cwd(), 'serviceAccountKey.json'));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://ejitor-storage-default-rtdb.firebaseio.com"
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  const { title, body, image } = req.body || {};
  if (!title || !body) {
    return res.status(400).json({ error: 'Title and Body required' });
  }

  try {
    const timestamp = Date.now();

    // ১. আপনার MyNotificationService-এর জন্য ডেটাবেস আপডেট
    await admin.database().ref('broadcast_notification').set({
      title: title,
      body: body,
      image: image || '',
      timestamp: timestamp
    });

    // ২. ক্লাউড মেসেজিং ফায়ার করা
    try {
      await admin.messaging().send({
        topic: 'all_users',
        notification: { title, body, ...(image ? { imageUrl: image } : {}) },
        data: { title, body, ...(image ? { image: image } : {}) }
      });
    } catch (e) {}

    return res.status(200).json({ success: true, message: 'Broadcast sent successfully!' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
