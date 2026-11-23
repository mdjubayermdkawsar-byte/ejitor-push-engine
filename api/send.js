const https = require('https');

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

    await sendToFirebaseDB({
      title: title,
      body: body,
      image: image || '',
      timestamp: Date.now()
    });

    return res.status(200).json({
      success: true,
      message: 'Notification broadcasted successfully!'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
