const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static('public'));
app.use(express.json());

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

// Funkcija za upis u Sheet
async function upisiUSheet(data) {
  const rows = data.artikli.map(a => [
    new Date().toLocaleString('hr-HR'), // Datum skeniranja
    data.dobavljac, // Dobavljač
    data.datum_otpremnice, // Datum otpremnice
    a.naziv, // Naziv artikla
    a.kolicina, // Količina
    a.jedinica, // Jedinica mjere
    a.temperatura, // Temperatura
    a.lot, // LOT/Šarža
    data.status // Status
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'A1',
    valueInputOption: 'USER_ENTERED',
    resource: { values: rows },
  });

  console.log(`Upisano ${rows.length} redova u Sheet`);
}

// PROMPT V4 - forsira čitanje LOT-a ispod naziva artikla
const prompt = `Ti si OCR ekspert za Metro Cash & Carry otpremnice. Tvoj posao je izvući SVAKI LOT broj.

Struktura: {"dobavljac": "METRO CASH & CARRY", "datum_otpremnice": "YYYY-MM-DD", "artikli": [{"naziv": "", "kolicina": 0, "jedinica": "", "temperatura": null, "lot": ""}], "status": "prolaz"}.

UPUTA ZA LOT - NAJVAŽNIJE:
Za SVAKI artikal u tablici napravi ovo:
1. Pročitaj "Naziv artikla"
2. ZOOMIRAJ ISPOD tog naziva - u 90% slučajeva piše sitnim fontom "L:XXXXX" ili "Lot XXXXX" ili "Šarža: XXXXX"
3. Ako vidiš "L24315" izvuci "24315"
4. Ako vidiš "Lot 240815" izvuci "240815"
5. Pregledaj i stupac "Šarža" ako postoji
6. NE PRELAZI na sljedeći artikal dok ne provjeriš 3 puta jel ima LOT ispod naziva

KOLIČINA: Stupac "Količina" ili "Kol". "12,50" = 12.5
JEDINICA: Stupac "JM" ili "Jmj". Vrati: "KG", "KOM", "LIT", "KUT", "PAK"
TEMPERATURA: Stupac "Uvjet skladištenja" ili "Uvjet". "+4°C"=4, "Hlađeno"=4, "Smrznuto"=-18, ostalo=null
DATUM: "Datum isporuke" gore desno = YYYY-MM-DD

Ne smiješ vratiti artikal bez da provjeriš LOT ispod naziva. Ako stvarno nema, stavi "".
Status "prolaz" ako je sve čitljivo, "pad" ako fali ključni podatak.`;

app.post('/api/scan', upload.single('otpremnica'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nema fajla' });

    const API_KEY = process.env.GEMINI_API_KEY;
    // PROMJENA: Prebačeno na gemini-1.5-pro jer bolje čita sitni tekst
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent?key=${API_KEY}`;

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

    if (data.error) {
      console.error('Gemini API error:', data.error);
      throw new Error(data.error.message);
    }

    const text = data.candidates[0].content.parts[0].text;
    console.log('AI odgovor:', text);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI nije vratio JSON');

    const jsonData = JSON.parse(jsonMatch[0]);

    // Upis u Google Sheet
    await upisiUSheet(jsonData);

    res.json(jsonData);
  } catch (err) {
    console.error('Greška:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server radi na portu ${PORT}`));
