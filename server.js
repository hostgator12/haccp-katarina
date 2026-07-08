const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static('public'));
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Google Sheets setup
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });
const SHEET_ID = process.env.GOOGLE_SHEET_ID;

async function upisiUSheet(data) {
  const rows = data.artikli.map(a => [
    new Date().toLocaleString('hr-HR'),
    data.dobavljac,
    data.datum_otpremnice,
    a.naziv,
    a.kolicina,
    a.jedinica,
    a.temperatura,
    a.lot,
    data.status
  ]);
  
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'A1',
    valueInputOption: 'USER_ENTERED',
    resource: { values: rows },
  });
}

 const prompt = `Ti si HACCP asistent za hrvatske otpremnice. Analiziraj dokument i vrati SAMO JSON bez teksta okolo.

Struktura: {"dobavljac": "", "datum_otpremnice": "YYYY-MM-DD", "artikli": [{"naziv": "", "kolicina": 0, "jedinica": "", "temperatura": null, "lot": ""}], "status": "prolaz"}.

PRAVILA ZA LOT/BROJ SERIJE:
- Traži: "LOT", "Lot", "Šarža", "Serija", "L/B", "Broj serije", "Batch"
- Često je u malom fontu ispod naziva artikla ili u zasebnom stupcu desno
- Ako ga nema nigdje, stavi ""
- Nikad ne izmišljaj LOT

TEMPERATURA: Ako piše "Amb" ili nema, stavi null. Ako piše broj tipa "4°C", stavi 4.

DOBAVLJAČ: Traži logo/naziv firme na vrhu. Metro = "Metro Cash & Carry"

Ako nešto ne možeš pročitati, stavi "". Status je "prolaz" ako je sve ok, inače "pad".`;

app.post('/api/scan', upload.single('otpremnica'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nema fajla' });
    
    const API_KEY = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
    
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
    
    const jsonData = JSON.parse(jsonMatch[0]);
    await upisiUSheet(jsonData);
    res.json(jsonData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server radi na portu ${PORT}`));
