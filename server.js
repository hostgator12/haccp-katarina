const express = require('express');
const multer = require('multer');
const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static('public'));
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

const prompt = `Ti si HACCP asistent. Analiziraj otpremnicu i vrati SAMO JSON bez ikakvog teksta okolo.
Struktura: {"dobavljac": "", "datum_otpremnice": "YYYY-MM-DD", "artikli": [{"naziv": "", "kolicina": 0, "jedinica": "", "temperatura": null, "lot": ""}], "status": "prolaz"}. 
Ako temperatura nije navedena, stavi null. Ako nešto ne možeš pročitati, stavi "". Status je "prolaz" ako je sve ok, inače "pad".`;

app.get('/models', async (req, res) => {
  const API_KEY = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1/models?key=${API_KEY}`;
  const apiRes = await fetch(url);
  const data = await apiRes.json();
  res.json(data);
});

app.post('/api/scan', upload.single('otpremnica'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nema fajla' });
    
    const API_KEY = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-pro-vision:generateContent?key=${API_KEY}`;
    
    const body = {
      contents: [{
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: req.file.mimetype,
              data: req.file.buffer.toString('base64')
            }
          }
        ]
      }]
    };

    const apiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await apiRes.json();
    
    if (data.error) throw new Error(data.error.message);
    
    const text = data.candidates[0].content.parts[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI nije vratio JSON');
    
    res.json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server radi na portu ${PORT}`));
