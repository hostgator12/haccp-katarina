const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// VAŽNO: apiVersion: "v1"
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, { apiVersion: "v1" });
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const prompt = `Ti si HACCP asistent. Analiziraj otpremnicu i vrati SAMO JSON bez ikakvog teksta okolo.
Struktura: {"dobavljac": "", "datum_otpremnice": "YYYY-MM-DD", "artikli": [{"naziv": "", "kolicina": 0, "jedinica": "", "temperatura": null, "lot": ""}], "status": "prolaz"}. 
Ako temperatura nije navedena, stavi null. Ako nešto ne možeš pročitati, stavi "". Status je "prolaz" ako je sve ok, inače "pad".`;

app.post('/api/scan', upload.single('otpremnica'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nema fajla' });
    
    const imagePart = {
      inlineData: {
        data: req.file.buffer.toString('base64'),
        mimeType: req.file.mimetype,
      },
    };
    
    const result = await model.generateContent([prompt, imagePart]);
    const text = result.response.text();
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI nije vratio JSON');
    
    res.json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server radi na portu ${PORT}`));
