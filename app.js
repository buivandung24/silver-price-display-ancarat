const express = require('express');
const axios = require('axios');
const app = express();
const port = 8192;

const vietnamTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false // 24h format
});

app.set('view engine', 'ejs');
app.use(express.static('public'));

let last_update = '';
let vat_note = '';
let hotline = '';

// Biến lưu giá cũ cho từng sản phẩm
const previousPrices = {}; // { 'title': { sell: number, buy: number, changePercent: string } }

const desired_products = [
  { title: 'Bạc tích trữ 999 1 lượng', keywords: ['999', '1 lượng', 'Ngân Long'] },
  { title: 'Bạc tích trữ 999 5 lượng', keywords: ['999', '5 lượng', 'Ngân Long'] },
  { title: 'Bạc tích trữ 999 1 Kilo', keywords: ['999', '1 Kilo', 'Ngân Long'] },
  { title: 'Bạc mỹ nghệ trắng 999 1 lượng',      keywords: ['Bitcoin', '1 lượng'] },
  { title: 'Bạc mỹ nghệ màu 999 1 lượng',      keywords: ['Sài Gòn', '1 lượng'] },
  { title: 'Bạc Noel 999 1 lượng', keywords: ['Noel', '1 lượng', '999', 'bản màu'] },
  { title: 'Vàng 9999 1 chỉ',   keywords: ['Vàng', '1 chỉ', '9999', 'Kim Ấn'] },
  { title: 'Vàng 9999 0.1 chỉ', keywords: ['Vàng', '0.1 chỉ', '9999'] },
  { title: 'Vàng trang sức 9999 1 chỉ',   keywords: ['Vàng', '1 chỉ', 'Nhẫn', '9999'] }
];

function calculateChange(current, previous) {
  if (!previous || previous <= 0 || !current || current === '-') return null;
  const currNum = parseFloat(current.replace(/,/g, ''));
  const prevNum = previous;
  if (isNaN(currNum) || prevNum <= 0) return null;
  
  const percent = ((currNum - prevNum) / prevNum) * 100;
  const rounded = percent.toFixed(2);

  // Chỉ trả về nếu thực sự có thay đổi
  if (parseFloat(rounded) === 0) return null;
  
  return rounded;
}

async function fetchSilverData() {
  const api_url_silver = "https://giabac.ancarat.com/api/price-data";
  try {
    const response = await axios.get(api_url_silver, { timeout: 10000 }); // Giảm timeout xuống 10s để tránh treo
    if (response.status === 200) {
      let data = response.data;

      if (data.length >= 3) {
        const meta = data.slice(-3);
        data = data.slice(0, -3);

        if (meta[0].length >= 3 && meta[0][2]) last_update = meta[0][2];
        if (meta[1].length >= 1 && meta[1][0]) vat_note = meta[1][0];
        if (meta[2].length >= 1 && meta[2][0]) hotline = meta[2][0];
      }

      const all_products = data
        .map(row => ({ name: (row[0] || '').trim(), sell: (row[1] || '').trim(), buy: (row[2] || '').trim() }))
        .filter(p => p.name && p.sell && p.buy);

      const displayed_products = [];

      for (const desired of desired_products) {
        const matched = all_products.find(product => {
          const lowerName = product.name.toLowerCase();
          return desired.keywords.every(kw => lowerName.includes(kw.toLowerCase()));
        });

        let sell = '-';
        let buy = '-';
        let changePercent = '0.00';

        if (matched) {
          sell = matched.sell;
          buy = matched.buy;

          const sellNum = parseFloat(sell.replace(/,/g, ''));
          const prev = previousPrices[desired.title];

          if (prev && prev.sell > 0) {
            const change = calculateChange(sell, prev.sell);
            if (change !== null) {
              changePercent = change; // Chỉ gán nếu có thay đổi thực sự
            } else if (prev.changePercent && prev.changePercent !== '-') {
              changePercent = prev.changePercent; // Giữ % cũ nếu trước đó đã thay đổi
            }
          }

          // Cập nhật giá cũ (chỉ nếu có giá mới hợp lệ)
          if (sellNum > 0) {
            previousPrices[desired.title] = {
              sell: sellNum,
              buy: parseFloat(buy.replace(/,/g, '')) || 0,
              changePercent: changePercent
            };
          } else if (prev) {
            changePercent = prev.changePercent && prev.changePercent !== '-' ? prev.changePercent : '-';
          }
        } else if (previousPrices[desired.title]) {
          const prev = previousPrices[desired.title];
          changePercent = prev.changePercent && prev.changePercent !== '-' ? prev.changePercent : '-';
        }

        displayed_products.push({
          name: desired.title,
          sell,
          buy,
          change: changePercent
        });
      }

      return displayed_products;
    }
  } catch (error) {
    console.error('Error fetching silver API:', error.message);
    last_update = 'Lỗi kết nối API';
  }
  return desired_products.map(d => ({ name: d.title, sell: '-', buy: '-', change: '-' }));
}

// Route API để AJAX lấy dữ liệu
app.get('/api/data', async (req, res) => {
  const products = await fetchSilverData();

  let current_time = '';
  if (products.length > 0 && last_update !== 'Lỗi kết nối API') {
    current_time = vietnamTimeFormatter.format(new Date());
  } else {
    current_time = 'Lỗi cập nhật';
  }

  res.json({
    products,
    current_time,
    vat_note,
    hotline
  });
});

// Route chính
app.get('/', async (req, res) => {
  const products = await fetchSilverData();

  let current_time = '';
  if (products.length > 0 && last_update !== 'Lỗi kết nối API') {
    current_time = vietnamTimeFormatter.format(new Date());
  } else {
    current_time = 'Lỗi cập nhật';
  }

  res.render('index', {
    products,
    current_time,
    last_update,
    vat_note,
    hotline
  });
});

app.get('/xadan', async (req, res) => {
  const products = await fetchSilverData();
  let current_time = '';
  if (products.length > 0 && last_update !== 'Lỗi kết nối API') {
    current_time = vietnamTimeFormatter.format(new Date());
  } else {
    current_time = 'Lỗi cập nhật';
  }

  res.render('xadan', {
    products,
    current_time,
    last_update,
    vat_note,
    hotline
  });
});

app.get('/nguyentrai', async (req, res) => {
  const products = await fetchSilverData();
  res.render('nguyentrai', { 
    products, 
    current_time: vietnamTimeFormatter.format(new Date()) 
  });
});

app.get('/nguyentrai1', async (req, res) => {
  const products = await fetchSilverData();
  res.render('nguyentrai1', { 
    products, 
    current_time: vietnamTimeFormatter.format(new Date()) 
  });
});

app.get('/nguyentrai2', async (req, res) => {
  const products = await fetchSilverData();
  res.render('nguyentrai2', { 
    products, 
    current_time: vietnamTimeFormatter.format(new Date()) 
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});