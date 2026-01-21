/**
 * Türk Patent API - Full Detail Support
 * Marka arama + Detay sayfası bilgileri
 */

const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-core');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Browser başlat
async function getBrowser() {
    return puppeteer.launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process']
    });
}

// Marka Arama Endpoint
app.post('/api/search', async (req, res) => {
    const { searchText } = req.body.params || req.body;
    const limit = req.body.limit || 100;

    if (!searchText) return res.json({ success: false, error: 'Arama terimi gerekli' });

    let browser;
    try {
        browser = await getBrowser();
        const page = await browser.newPage();

        await page.goto('https://www.turkpatent.gov.tr/arastirma-yap', { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForSelector('input.MuiInputBase-input', { timeout: 10000 });

        const inputs = await page.$$('input.MuiInputBase-input');
        for (const input of inputs) {
            const placeholder = await input.evaluate(el => el.placeholder);
            if (placeholder && placeholder.includes('Marka')) {
                await input.type(searchText);
                break;
            }
        }

        await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const btn of buttons) {
                if (btn.textContent.includes('Sorgula')) { btn.click(); break; }
            }
        });

        await new Promise(r => setTimeout(r, 5000));

        const results = await page.evaluate((maxLimit) => {
            const rows = document.querySelectorAll('tr');
            const data = [];
            rows.forEach((row, idx) => {
                if (idx === 0 || data.length >= maxLimit) return;
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
            return data;
        }, limit);

        await browser.close();
        res.json({ success: true, source: 'live', payload: { items: results } });
    } catch (error) {
        if (browser) await browser.close();
        res.json({ success: false, error: error.message });
    }
});

// Detay Sayfası Endpoint
app.post('/api/detail', async (req, res) => {
    const { applicationNo } = req.body;

    if (!applicationNo) return res.json({ success: false, error: 'Başvuru numarası gerekli' });

    let browser;
    try {
        browser = await getBrowser();
        const page = await browser.newPage();

        // Arama sayfasına git ve başvuru numarasıyla ara
        await page.goto('https://www.turkpatent.gov.tr/arastirma-yap', { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForSelector('input.MuiInputBase-input', { timeout: 10000 });

        const inputs = await page.$$('input.MuiInputBase-input');
        for (const input of inputs) {
            const placeholder = await input.evaluate(el => el.placeholder);
            if (placeholder && placeholder.includes('Marka')) {
                await input.type(applicationNo);
                break;
            }
        }

        await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const btn of buttons) {
                if (btn.textContent.includes('Sorgula')) { btn.click(); break; }
            }
        });

        await new Promise(r => setTimeout(r, 4000));

        // DETAY butonuna tıkla
        await page.evaluate(() => {
            const detayBtn = document.querySelector('button[class*="detay"], button:has-text("DETAY")');
            if (detayBtn) detayBtn.click();
            else {
                const buttons = document.querySelectorAll('button');
                for (const btn of buttons) {
                    if (btn.textContent.includes('DETAY')) { btn.click(); break; }
                }
            }
        });

        await new Promise(r => setTimeout(r, 3000));

        // Detay bilgilerini çek
        const detail = await page.evaluate(() => {
            const result = {
                markaBilgileri: {},
                islemBilgileri: []
            };

            // Tablo hücrelerinden bilgi çek
            const rows = document.querySelectorAll('table tr, .MuiTableRow-root');

            rows.forEach(row => {
                const cells = row.querySelectorAll('td, th');
                if (cells.length >= 2) {
                    const label = cells[0]?.innerText?.trim();
                    const value = cells[1]?.innerText?.trim();
                    if (label && value) {
                        result.markaBilgileri[label] = value;
                    }
                    // 4 sütunlu satırlar için
                    if (cells.length >= 4) {
                        const label2 = cells[2]?.innerText?.trim();
                        const value2 = cells[3]?.innerText?.trim();
                        if (label2 && value2) {
                            result.markaBilgileri[label2] = value2;
                        }
                    }
                }
            });

            // İşlem bilgileri tablosu
            const islemRows = document.querySelectorAll('table:last-of-type tr');
            islemRows.forEach((row, idx) => {
                if (idx === 0) return; // Header
                const cells = row.querySelectorAll('td');
                if (cells.length >= 3) {
                    result.islemBilgileri.push({
                        tarih: cells[0]?.innerText?.trim() || '',
                        tebligTarihi: cells[1]?.innerText?.trim() || '',
                        islem: cells[2]?.innerText?.trim() || '',
                        aciklama: cells[3]?.innerText?.trim() || ''
                    });
                }
            });

            return result;
        });

        await browser.close();
        res.json({ success: true, detail });
    } catch (error) {
        if (browser) await browser.close();
        res.json({ success: false, error: error.message });
    }
});

app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Türk Patent API çalışıyor', endpoints: ['/api/search', '/api/detail'] });
});

app.listen(PORT, () => console.log(`API: ${PORT}`));
