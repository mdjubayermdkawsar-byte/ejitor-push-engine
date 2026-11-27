const https = require('https');

function firebaseRequest(path, method, dataObj) {
  return new Promise((resolve, reject) => {
    const data = dataObj ? JSON.stringify(dataObj) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (data) headers['Content-Length'] = Buffer.byteLength(data);

    const options = {
      hostname: 'ejitor-storage-default-rtdb.firebaseio.com',
      path: path,
      method: method,
      headers: headers
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
    if (data) req.write(data);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ১. মোট সংখ্যা ও পাঠানো নোটিফিকেশনের তালিকা দেখা (GET)
  if (req.method === 'GET') {
    try {
      const raw = await firebaseRequest('/notification_history.json', 'GET', null);
      if (!raw || raw.trim() === 'null') {
        return res.status(200).json({ success: true, total: 0, notifications: [] });
      }
      const parsed = JSON.parse(raw);
      const list = Object.keys(parsed).map((key) => ({
        id: key,
        title: parsed[key].title || '',
        body: parsed[key].body || '',
        image: parsed[key].image || '',
        timestamp: parsed[key].timestamp || 0
      }));
      list.sort((a, b) => b.timestamp - a.timestamp);

      return res.status(200).json({
        success: true,
        total: list.length,
        notifications: list
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // ২. নতুন নোটিফিকেশন পাঠানো (POST)
  if (req.method === 'POST') {
    try {
      const { title, body, image } = req.body || {};
      if (!title || !body) {
        return res.status(400).json({ success: false, error: 'Title এবং Message দিন!' });
      }

      const notifId = 'n_' + Date.now();
      const payload = {
        id: notifId,
        title: String(title),
        body: String(body),
        image: image ? String(image) : '',
        timestamp: Date.now()
      };

      await Promise.all([
        firebaseRequest(`/notification_history/${notifId}.json`, 'PUT', payload),
        firebaseRequest('/broadcast_notification.json', 'PUT', payload)
      ]);

      return res.status(200).json({
        success: true,
        message: 'Notification broadcasted successfully!',
        id: notifId
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // ৩. আগের সব নোটিফিকেশন ডিলিট করা (DELETE)
  if (req.method === 'DELETE') {
    try {
      const id = req.query && req.query.id ? String(req.query.id) : '';
      if (id && id !== 'all') {
        await firebaseRequest(`/notification_history/${id}.json`, 'DELETE', null);
        return res.status(200).json({ success: true, message: 'Notification deleted!' });
      } else {
        await Promise.all([
          firebaseRequest('/notification_history.json', 'DELETE', null),
          firebaseRequest('/broadcast_notification.json', 'DELETE', null)
        ]);
        return res.status(200).json({ success: true, message: 'All notifications deleted!' });
      }
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
};
