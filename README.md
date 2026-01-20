# Türk Patent API - Puppeteer

Bu API, Türk Patent veritabanından **canlı marka verisi** çeker.

## Deploy Etme

### Railway.app (Ücretsiz)
1. [railway.app](https://railway.app) hesabı oluşturun
2. GitHub'a bu klasörü yükleyin
3. Railway'de "New Project" → "Deploy from GitHub repo"
4. Otomatik deploy olacak
5. URL'nizi alın (örn: `https://turkpatent-api.up.railway.app`)

### Render.com (Ücretsiz)
1. [render.com](https://render.com) hesabı oluşturun
2. "New Web Service" → GitHub repo seçin
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Deploy'a tıklayın

## Kullanım

```bash
POST /api/search
Content-Type: application/json

{
  "params": {
    "searchText": "VOIPER"
  }
}
```

## Frontend Entegrasyonu

`index.html` dosyasındaki API URL'ini güncelleyin:

```javascript
const response = await fetch('https://YOUR-APP.up.railway.app/api/search', {
```
