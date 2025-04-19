import fetch from 'node-fetch';
import dotenv from 'dotenv';
import http from 'http';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import moment from 'moment-timezone';

dotenv.config();

const TOKEN = process.env.BOT_TOKEN;
const API = `https://api.telegram.org/bot${TOKEN}`;
const PORT = process.env.PORT || 3000;
const ALLOWED_GROUP_ID = process.env.ALLOWED_GROUP_ID;
const TIME_ZONE = 'Asia/Ho_Chi_Minh';

// Danh sách món ăn mặc định (hardcode)
const DEFAULT_MENU = [
  "Thịt chiên",
  "Thịt kho chả",
  "Thịt kho trứng",
  "Đậu hũ nhồi thịt",
  "Sườn ram",
  "Cá diêu Hồng sốt cà",
  "Vịt kho gừng",
  "Thịt luộc",
  "Thịt kho tiêu",
  "Cá khô dứa",
  "Đùi gà",
  "Cánh gà",
  "Gà sả",
  "Cá lóc kho",
  "Thịt rim tôm",
  "Cá nục chiên",
  "Đậu hủ nhồi thịt",
  "Mực xào",
  "Cá ngừ kho thơm",
  "Mắm ruốc",
  "Canh chua cá lóc",
  "Canh chua cá diêu Hồng",
  "Canh khổ qua"
];

// Khởi tạo lowdb
const adapter = new JSONFile('db.json');
const db = new Low(adapter, { menu: DEFAULT_MENU, orders: {} });

// Hàm escape ký tự Markdown
function escapeMarkdown(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

// Khởi tạo server và database
(async () => {
  try {
    // Đọc hoặc khởi tạo database
    await db.read();
    db.data = db.data || { menu: DEFAULT_MENU, orders: {} };
    await db.write();

    // Tạo server HTTP
    const server = http.createServer(async (req, res) => {
      if (req.method === 'POST' && req.url === '/') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
          try {
            // Log toàn bộ body để debug
            console.log('Body nhận được:', body);
            const update = JSON.parse(body);
            const msg = update.message?.text?.trim() || '';
            const chatId = update.message?.chat?.id?.toString();
            const username = update.message?.from?.username || update.message?.from?.first_name || 'Unknown';
            const today = moment().tz(TIME_ZONE).format('YYYY-MM-DD');

            // Log thời gian và tin nhắn
            const now = moment().tz(TIME_ZONE).format('DD/MM/YYYY, HH:mm:ss');
            console.log(`[${now}] Tin nhắn từ ${username} trong chat ${chatId}: "${msg}"`);

            // Lệnh /getchatid - Lấy chat_id của group
            if (msg === '/getchatid'  && username === 'minhhy_p') {
              await sendMessage(chatId, `🆔 ID của group này là: \`${chatId}\``);
              return res.end('ok');
            }

            // Kiểm tra chat_id
            if (chatId !== ALLOWED_GROUP_ID) {
              await sendMessage(chatId, `ℹ️ Bot chỉ hoạt động trong group được phép. Liên hệ admin để biết thêm.`);
              console.log(`[${now}] Tin nhắn từ chat không được phép: ${chatId}`);
              return res.end('ok');
            }

            // Lệnh /guide - Hướng dẫn đặt và hủy món
            if (msg === '/guide') {
              const guideMessage = `📖 **Hướng dẫn đặt và hủy món cho người mới**:

1. **Xem danh sách món ăn**:
   - Gõ: /menu
   - Ví dụ: Xem các món như Thịt chiên, Thịt kho chả...

2. **Đặt món**:
   - Gõ: /order <tên món> [số lượng] [itcom]
   - Trong đó:
     - <tên món>: Tên món trong menu (VD: Thịt chiên).
     - [số lượng]: Số phần, mặc định là 1 (VD: 2).
     - [itcom]: Thêm nếu muốn ít cơm.
   - Ví dụ:
     - /order Thịt chiên → Đặt 1 phần.
     - /order Thịt kho chả 2 → Đặt 2 phần Thịt kho chả.
     - /order Thịt chiên 1 itcom → Đặt 1 phần ít cơm.

3. **Xem đơn đã đặt**:
   - Gõ: /myorders
   - Ví dụ: Xem bạn đã đặt 2 phần Thịt chiên (ít cơm) hôm nay.

4. **Hủy món**:
   - Gõ: /removeorder <tên món>
   - Ví dụ: /removeorder Thịt chiên → Xóa tất cả đơn Thịt chiên của bạn hôm nay.

5. **Xem tổng hợp đơn hàng**:
   - Gõ: /summary
   - Ví dụ: Xem tất cả món mọi người đã đặt hôm nay.

💡 **Lưu ý**:
- Tên món phải đúng với menu (dùng /menu để kiểm tra).
- Đặt hoặc hủy món chỉ áp dụng trong ngày hôm nay.
- Có thắc mắc? Gõ /guide để xem lại hướng dẫn!`;
              await sendMessage(chatId, guideMessage);
              return res.end('ok');
            }

            // Lệnh /menu - Xem danh sách món ăn
            if (msg === '/menu') {
              const menuList = db.data.menu.length > 0 
                ? db.data.menu.map((item, index) => `${index + 1}. ${escapeMarkdown(item)}`).join('\n')
                : 'Chưa có món ăn nào trong menu!';
              await sendMessage(chatId, `📋 **Danh sách món ăn**:\n${menuList}`);
              return res.end('ok');
            }

            // Lệnh /editmenu - Chỉnh sửa danh sách món ăn (chỉ minhhy_p)
            if (msg.startsWith('/editmenu')) {
              if (username === 'minhhy_p') {
                const parts = msg.split(' ').slice(1);
                if (parts.length < 2 || !['add', 'remove'].includes(parts[0])) {
                  await sendMessage(chatId, '❗ Dùng: /editmenu add <món> hoặc /editmenu remove <món>');
                  return res.end('ok');
                }

                const action = parts[0];
                const dish = parts.slice(1).join(' ').trim();

                if (action === 'add') {
                  if (db.data.menu.includes(dish)) {
                    await sendMessage(chatId, `⚠️ Món "${escapeMarkdown(dish)}" đã có trong menu!`);
                  } else {
                    db.data.menu.push(dish);
                    await db.write();
                    await sendMessage(chatId, `✅ Đã thêm "${escapeMarkdown(dish)}" vào menu!`);
                  }
                } else if (action === 'remove') {
                  if (!db.data.menu.includes(dish)) {
                    await sendMessage(chatId, `⚠️ Món "${escapeMarkdown(dish)}" không có trong menu!`);
                  } else {
                    db.data.menu = db.data.menu.filter(item => item !== dish);
                    await db.write();
                    await sendMessage(chatId, `✅ Đã xóa "${escapeMarkdown(dish)}" khỏi menu!`);
                  }
                }
              } else {
                await sendMessage(chatId, `ℹ️ Lệnh "${msg}" không hợp lệ. Dùng /menu, /order, /myorders, /removeorder, /summary, /guide.`);
              }
              return res.end('ok');
            }

            // Lệnh /resetdata - Xóa toàn bộ dữ liệu (chỉ minhhy_p)
            if (msg === '/resetdata') {
              if (username === 'minhhy_p') {
                db.data = { menu: DEFAULT_MENU, orders: {} };
                await db.write();
                await sendMessage(chatId, `🗑️ Đã xóa toàn bộ dữ liệu! Menu được đặt lại về mặc định.`);
              } else {
                await sendMessage(chatId, `ℹ️ Lệnh "${msg}" không hợp lệ. Dùng /menu, /order, /myorders, /removeorder, /summary, /guide.`);
              }
              return res.end('ok');
            }

            // Lệnh /order - Đặt món
            if (msg.startsWith('/order')) {
              const parts = msg.split(' ').slice(1);
              if (parts.length === 0) {
                await sendMessage(chatId, '❗ Dùng: /order <món ăn> [số lượng] [itcom]');
                return res.end('ok');
              }

              // Xử lý món, số lượng, và ít cơm
              let quantity = 1;
              let lessRice = false;
              let dishParts = parts;

              // Kiểm tra itcom
              if (parts.includes('itcom')) {
                lessRice = true;
                dishParts = parts.filter(p => p !== 'itcom');
              }

              // Kiểm tra số lượng
              if (dishParts.length > 1 && /^\d+$/.test(dishParts[dishParts.length - 1])) {
                quantity = parseInt(dishParts[dishParts.length - 1], 10);
                dishParts = dishParts.slice(0, -1);
              }

              // Ghép tên món
              const dish = dishParts.join(' ').trim();
              if (!dish) {
                await sendMessage(chatId, '❗ Vui lòng nhập tên món ăn!');
                return res.end('ok');
              }

              // Kiểm tra món có trong menu
              if (!db.data.menu.includes(dish)) {
                await sendMessage(chatId, `❌ Không có món "${escapeMarkdown(dish)}" trong menu! Dùng /menu để xem danh sách.`);
                return res.end('ok');
              }

              // Lưu đơn đặt hàng
              db.data.orders[today] = db.data.orders[today] || {};
              db.data.orders[today][username] = db.data.orders[today][username] || [];
              db.data.orders[today][username].push({ dish, quantity, lessRice });
              await db.write();

              const riceNote = lessRice ? ' (ít cơm)' : '';
              await sendMessage(chatId, `🍽️ Đã đặt ${quantity} phần "${escapeMarkdown(dish)}"${riceNote} cho ${escapeMarkdown(username)}!`);
              return res.end('ok');
            }

            // Lệnh /myorders - Xem đơn đặt hàng của username
            if (msg === '/myorders') {
              const todayOrders = db.data.orders[today]?.[username] || [];
              if (todayOrders.length === 0) {
                await sendMessage(chatId, `📜 Bạn chưa đặt món nào hôm nay (${today})!`);
                return res.end('ok');
              }

              const orderList = todayOrders
                .map(({ dish, quantity, lessRice }, index) => 
                  `${index + 1}. ${escapeMarkdown(dish)}: ${quantity} phần${lessRice ? ' (ít cơm)' : ''}`)
                .join('\n');
              const message = `📜 **Đơn đặt hàng của ${escapeMarkdown(username)} hôm nay (${today})**:\n${orderList}`;
              await sendMessage(chatId, message);
              return res.end('ok');
            }

            // Lệnh /removeorder - Xóa đơn đặt hàng
            if (msg.startsWith('/removeorder')) {
              const parts = msg.split(' ').slice(1);
              if (parts.length < 1) {
                await sendMessage(chatId, '❗ Dùng: /removeorder <món>');
                return res.end('ok');
              }

              const dish = parts.join(' ').trim();
              if (!dish) {
                await sendMessage(chatId, '❗ Vui lòng nhập tên món để xóa!');
                return res.end('ok');
              }

              const todayOrders = db.data.orders[today]?.[username] || [];
              const initialLength = todayOrders.length;
              db.data.orders[today][username] = todayOrders.filter(order => order.dish !== dish);
              await db.write();

              if (db.data.orders[today][username].length === initialLength) {
                await sendMessage(chatId, `⚠️ Bạn chưa đặt món "${escapeMarkdown(dish)}" hôm nay!`);
              } else {
                await sendMessage(chatId, `✅ Đã xóa đơn "${escapeMarkdown(dish)}" của ${escapeMarkdown(username)}!`);
              }
              return res.end('ok');
            }

            // Lệnh /summary - Xem tổng hợp đơn đặt hàng trong ngày
            if (msg === '/summary') {
              const todayOrders = db.data.orders[today] || {};
              const dishCounts = {};

              // Tính tổng số lượng mỗi món
              for (const user in todayOrders) {
                todayOrders[user].forEach(({ dish, quantity, lessRice }) => {
                  const key = `${escapeMarkdown(dish)}${lessRice ? ' (ít cơm)' : ''}`;
                  dishCounts[key] = (dishCounts[key] || 0) + quantity;
                });
              }

              const summary = Object.entries(dishCounts).length > 0
                ? Object.entries(dishCounts)
                    .map(([dish, count]) => `- ${dish}: ${count} phần`)
                    .join('\n')
                : 'Chưa có đơn đặt hàng nào hôm nay!';
              await sendMessage(chatId, `📊 **Tổng hợp đơn đặt hàng hôm nay (${today})**:\n${summary}`);
              return res.end('ok');
            }

            // Xử lý các lệnh/tin nhắn khác
            await sendMessage(chatId, `ℹ️ Lệnh "${msg}" không hợp lệ. Dùng /menu, /order, /myorders, /removeorder, /summary, /guide.`);
            console.log(`[${now}] Lệnh không nhận diện: "${msg}"`);
            return res.end('ok');
          } catch (error) {
            console.error('Lỗi xử lý yêu cầu:', error);
            res.end('error');
          }
        });
      } else {
        res.end('ok');
      }
    });

    // Khởi động server
    server.listen(PORT, () => console.log(`Bot đang chạy trên cổng ${PORT}`));

    // Hàm gửi tin nhắn
    async function sendMessage(chatId, text) {
      try {
        console.log(`Chuẩn bị gửi tin nhắn tới ${chatId}: ${text}`);
        const response = await fetch(`${API}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
        });
        const result = await response.json();
        if (!result.ok) {
          console.error(`Lỗi Telegram API: ${JSON.stringify(result)}`);
          throw new Error(`Telegram API error: ${result.description}`);
        }
        console.log(`Gửi tin nhắn thành công tới ${chatId}: ${text}`);
        return result;
      } catch (error) {
        console.error('Lỗi gửi tin nhắn:', error);
        throw error;
      }
    }

    // Thiết lập webhook
    async function setWebhook() {
      try {
        const webhookUrl = process.env.WEBHOOK_URL || 'YOUR_NGROK_URL';
        const response = await fetch(`${API}/setWebhook?url=${webhookUrl}`);
        const result = await response.json();
        console.log('Webhook thiết lập:', result);
      } catch (error) {
        console.error('Lỗi thiết lập webhook:', error);
      }
    }

    if (process.env.WEBHOOK_URL) {
      await setWebhook();
    } else {
      console.warn('Chưa có WEBHOOK_URL trong .env. Chạy ngrok và thiết lập webhook thủ công.');
    }

  } catch (error) {
    console.error('Lỗi khởi tạo:', error);
  }
})();