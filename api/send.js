const https = require('https');
const crypto = require('crypto');

// ১. পুরোনো অ্যাপের জন্য Firebase Realtime Database-এ সেভ করা
function sendToFirebaseDB(dataObj) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(dataObj);
    const options = {
      hostname: 'ejitor-storage-default-rtdb.firebaseio.com',
      path: '/broadcast_notification.json',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body);
        } else {
          reject(new Error('Database error: HTTP ' + res.statusCode));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(data);
    req.end();
  });
}

// ২. Base64URL এনকোডিং হেল্পার
function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// ৩. Service Account থেকে OAuth2 Access Token নেওয়া (কোনো প্যাকেজ ছাড়াই)
function getGoogleAccessToken(serviceAccount) {
  return new Promise((resolve, reject) => {
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = base64url(JSON.stringify({
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    }));

    const unsignedJwt = `${header}.${payload}`;
    const privateKey = serviceAccount.private_key.replace(/\\n/g, '\n');
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(unsignedJwt);
    const signature = signer
      .sign(privateKey, 'base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const jwt = `${unsignedJwt}.${signature}`;
    const postData = `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${encodeURIComponent(jwt)}`;

    const options = {
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.access_token) {
            resolve(parsed.access_token);
          } else {
            reject(new Error('Token error: ' + body));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(postData);
    req.end();
  });
}

// ৪. FCM HTTP v1 API দিয়ে "all" টপিকে Push Notification পাঠানো
async function sendToFCM(title, body, image) {
  const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!saRaw) {
    throw new Error('Vercel-এ FIREBASE_SERVICE_ACCOUNT Environment Variable সেট করা নেই!');
  }

  const serviceAccount = JSON.parse(saRaw);
  const accessToken = await getGoogleAccessToken(serviceAccount);

  const fcmPayload = JSON.stringify({
    message: {
      topic: 'all',
      data: {
        title: String(title),
        body: String(body),
        image: image ? String(image) : ''
      },
      android: {
        priority: 'high'
      }
    }
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'fcm.googleapis.com',
      path: `/v1/projects/${serviceAccount.project_id}/messages:send`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(fcmPayload)
      }
    };

    const req = https.request(options, (res) => {
      let resBody = '';
      res.on('data', (chunk) => resBody += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(resBody);
        } else {
          reject(new Error('FCM error: HTTP ' + res.statusCode + ' - ' + resBody));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(fcmPayload);
    req.end();
  });
}

// ৫. মেইন Vercel হ্যান্ডলার
module.exports = async (req, res) => {
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
    const { title, body, image } = req.body || {};
    if (!title || !body) {
      return res.status(400).json({ success: false, error: 'Title এবং Message দিন!' });
    }

    // ডেটাবেস এবং FCM দুটোতেই একসাথে পাঠানো
    await Promise.all([
      sendToFirebaseDB({
        title: title,
        body: body,
        image: image || '',
        timestamp: Date.now()
      }),
      sendToFCM(title, body, image)
    ]);

    return res.status(200).json({
      success: true,
      message: 'Notification broadcasted successfully via DB & FCM!'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
