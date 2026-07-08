const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

const app = express();
const upload = multer({ dest: 'uploads/' });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

app.use(express.static('public'));
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});
app.post('/api/scan', upload.single('otpremnica'), async (req, res) => {
  try {
    const imagePath = req.file.path;
    const imageData = fs.readFileSync(imagePath);
    const imageBase64 = imageData.toString('base64');

    const prompt = `Ti si HACCP asistent za Hotel Katarina. Izvuci iz otpremnice: dobavljač, datum, broj dokumenta, i za svaki artikl: naziv, količina, JM, LOT, rok trajanja, GTIN. Vrati SAMO JSON.`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: imageBase64, mimeType: req.file.mimetype } }
    ]);

    const text = result.response.text();
    const json = JSON.parse(text.replace(/```json|```/g, ''));
    fs.unlinkSync(imagePath);
    res.json(json);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => console.log('Server radi'));
