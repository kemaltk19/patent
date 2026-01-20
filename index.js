/**
 * Türk Patent Marka Sorgulama API
 * Node.js + Puppeteer ile canlı veri çeker
 * Railway veya Render'da ücretsiz çalışır
 */

const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Ana endpoint
app.post('/api/search', async (req, res) => {
    const { searchText } = req.body.params || req.body;

    if (!searchText) {
        return res.json({ success: false, error: 'Arama terimi gerekli' });
    }

    console.log(`Arama: ${searchText}`);

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

        await page.goto('https://www.turkpatent.gov.tr/arastirma-yap', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Marka Adı alanını bul ve yaz
        await page.waitForSelector('input.MuiInputBase-input', { timeout: 10000 });

        const inputs = await page.$$('input.MuiInputBase-input');
        for (const input of inputs) {
            const placeholder = await input.evaluate(el => el.placeholder);
            if (placeholder && placeholder.includes('Marka')) {
                await input.type(searchText);
                break;
            }
        }

        // Sorgula butonunu tıkla
        await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const btn of buttons) {
                if (btn.textContent.includes('Sorgula') || btn.textContent.includes('SORGULA')) {
                    btn.click();
                    break;
                }
            }
        });

        // Sonuçları bekle
        await page.waitForTimeout(5000);

        // Tablo verilerini çek
        const results = await page.evaluate(() => {
            const rows = document.querySelectorAll('tr');
            const data = [];

            rows.forEach((row, idx) => {
                if (idx === 0) return; // Header atla
                const cells = row.querySelectorAll('td');
                if (cells.length >= 7) {
                    data.push({
                        markaName: cells[2]?.innerText?.trim() || '',
                        applicationNo: cells[1]?.innerText?.trim() || '',
                        holderName: cells[3]?.innerText?.trim() || '',
                        applicationDate: cells[4]?.innerText?.trim() || '',
                        currentStatus: cells[6]?.innerText?.trim() || '',
                        niceClasses: cells[7]?.innerText?.trim() || ''
                    });
                }
            });

            return data.slice(0, 20); // İlk 20 sonuç
        });

        await browser.close();

        res.json({
            success: true,
            source: 'live',
            payload: { items: results }
        });

    } catch (error) {
        console.error('Hata:', error.message);
        if (browser) await browser.close();

        res.json({
            success: false,
            error: 'Sorgulama sırasında hata oluştu: ' + error.message
        });
    }
});

// Health check
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Türk Patent API çalışıyor' });
});

app.listen(PORT, () => {
    console.log(`API sunucusu ${PORT} portunda çalışıyor`);
});
