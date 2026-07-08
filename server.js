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
    data.dobavljac,                    // Dobavljač
    data.datum_otpremnice,             // Datum otpremnice
    a.naziv,                           // Naziv artikla
    a.kolicina,                        // Količina
    a.jedinica,                        // Jedinica mjere
    a.temperatura,                     // Temperatura
    a.lot,                             // LOT/Šarža
    data.status                        // Status
  ]);
  
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'A1',
    valueInputOption: 'USER_ENTERED',
    resource: { values: rows },
  });
  
  console.log(`Upisano ${rows.length} redova u Sheet`);
}

// PROMPT optimiziran za Metro + Nikas + općenito
const prompt = `Ti si HACCP asistent za hrvatske otpremnice. Analiziraj dokument i vrati SAMO JSON bez teksta okolo.

Struktura: {"dobavljac": "", "datum_otpremnice": "YYYY-MM-DD", "artikli": [{"naziv": "", "kolicina": 0, "jedinica": "", "temperatura": null, "lot": ""}], "status": "prolaz"}.

MAPIRANJE POLJA:
1. DOBAVLJAČ: Traži logo/naz
