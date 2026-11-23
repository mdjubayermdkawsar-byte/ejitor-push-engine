const admin = require('firebase-admin');
const path = require('path');

// ফায়ারবেস ব্যাকএন্ড একবারই ইনিশিয়ালাইজ হবে
if (!admin.apps.length) {
  const serviceAccount = require(path.join(process.cwd(), 'serviceAccountKey.json'));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

module.exports = async (req, res) => {
  // CORS হেডার সেট করা যাতে যেকোনো ব্রাউজার ও অ্যাপ থেকে কল করা যায়
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET রিকোয়েস্ট দিলে সার্ভার স্ট্যাটাস দেখাবে
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'online',
      message: 'EJITOR Push Engine is Ready to Broadcast!',
      targetTopic: 'all_users'
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST method is allowed!' });
  }

  const { title, body, image } = req.body || {};

  if (!title || !body) {
    return res.status(400).json({ error: 'Title and Body are required!' });
  }

  // FCM v1 হাই-প্রাইওরিটি মেসেজ পেলোড
  const message = {
    topic: 'all_users',
    notification: {
      title: title,
      body: body,
      ...(image && image.trim() !== '' ? { imageUrl: image.trim() } : {})
    },
    data: {
      title: title,
      body: body,
      ...(image && image.trim() !== '' ? { image: image.trim() } : {})
    },
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        channelId: 'ejitor_instant_v4',
        priority: 'max',
        defaultVibrateTimings: true
      }
    }
  };

  try {
    const response = await admin.messaging().send(message);
    return res.status(200).json({
      success: true,
      messageId: response,
      broadcastTo: 'all_users'
    });
  } catch (error) {
    console.error('Push Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
