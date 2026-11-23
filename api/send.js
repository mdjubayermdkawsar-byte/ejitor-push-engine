const admin = require('firebase-admin');

module.exports = async (req, res) => {
  // যেকোনো বাহিরের HTML ফাইল থেকে রিকোয়েস্ট এলাউ করার জন্য CORS হেডার সবার আগে
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Only POST method allowed' });
  }

  try {
    if (!admin.apps.length) {
      if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
        throw new Error('Vercel Environment Variable-এ FIREBASE_SERVICE_ACCOUNT সেট করা নেই!');
      }
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://ejitor-storage-default-rtdb.firebaseio.com"
      });
    }

    const { title, body, image } = req.body || {};
    if (!title || !body) {
      return res.status(400).json({ success: false, error: 'Title এবং Message দেওয়া বাধ্যতামূলক!' });
    }

    const timestamp = Date.now();

    // ১. ডেটাবেসে নোটিফিকেশন সেভ করা
    try {
      await admin.database().ref('broadcast_notification').set({
        title: title,
        body: body,
        image: image || '',
        timestamp: timestamp
      });
    } catch (dbErr) {
      console.log('DB Write Warning:', dbErr.message);
    }

    // ২. FCM দিয়ে সমস্ত ইউজারের ফোনে পুশ পাঠানো
    const fcmResponse = await admin.messaging().send({
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
          priority: 'max'
        }
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Notification broadcasted successfully!',
      messageId: fcmResponse
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
