import fetch from 'node-fetch';
import dotenv from 'dotenv';
import http from 'http';
import moment from 'moment-timezone';
import { connectDB } from './config/database.js';
import { Order } from './models/index.js';

dotenv.config();

const TOKEN = process.env.BOT_TOKEN;
const API = `https://api.telegram.org/bot${TOKEN}`;
const PORT = process.env.PORT || 3000;
const ALLOWED_GROUP_ID = process.env.ALLOWED_GROUP_ID;
const TIME_ZONE = 'Asia/Ho_Chi_Minh';

// Menu cho thứ 2, 4, 6 (Monday, Wednesday, Friday)
const MENU_246 = [
  "Thịt chiên",
  "Chả cá rim nước mắm",
  "Thịt kho trứng",
  "Đậu hũ nhồi thịt",
  "Sườn ram",
  "Cá diêu Hồng sốt cà",
  "Vịt kho gừng",
  "Thịt luộc",
  "Thịt luộc nước mắm",
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
  "Canh khổ qua",
  "Cá cơm rim",
  "Mắm chưng",
  "Cơm trắng"
];

// Menu cho thứ 3, 5, 7 (Tuesday, Thursday, Saturday)
const MENU_357 = [
  "Thịt chiên",
  "Chả cá rim nước mắm",
  "Thịt kho trứng",
  "Đậu hũ nhồi thịt",
  "Sườn ram",
  "Cá diêu Hồng sốt cà",
  "Vịt kho gừng",
  "Thịt luộc",
  "Thịt luộc nước mắm",
  "Cá khô dứa",
  "Đùi gà",
  "Cánh gà",
  "Gà sả",
  "Cá lóc kho",
  "Cá nục chiên",
  "Đậu hủ nhồi thịt",
  "Mực xào",
  "Cá ngừ kho thơm",
  "Mắm ruốc",
  "Canh chua cá lóc",
  "Canh chua cá diêu Hồng",
  "Canh khổ qua",
  "Cá cơm rim",
  "Mắm chưng",
  "Cơm trắng"
];

/**
 * Hàm escape ký tự Markdown
 * @param {string} text - Văn bản cần escape
 * @returns {string} - Văn bản đã escape
 */
function escapeMarkdown(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

/**
 * Hàm chuẩn hóa chuỗi: loại bỏ dấu, chuyển về chữ thường
 * @param {string} str - Chuỗi cần chuẩn hóa
 * @returns {string} - Chuỗi đã chuẩn hóa
 */
function normalizeString(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Lấy menu phù hợp dựa trên ngày trong tuần
 * @param {string} date - Ngày (YYYY-MM-DD)
 * @returns {Array|null} - Menu array hoặc null nếu không có menu
 */
function getMenuByDate(date) {
  const dayOfWeek = moment(date).day(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  
  // Thứ 2, 4, 6 (Monday, Wednesday, Friday) = Menu 246
  if (dayOfWeek === 1 || dayOfWeek === 3 || dayOfWeek === 5) {
    return MENU_246;
  }
  // Thứ 3, 5, 7 (Tuesday, Thursday, Saturday) = Menu 357
  if (dayOfWeek === 2 || dayOfWeek === 4 || dayOfWeek === 6) {
    return MENU_357;
  }
  // Chủ nhật = không có menu
  return null;
}


/**
 * Tìm món ăn trong menu theo tên (có chuẩn hóa)
 * @param {string} dishInput - Tên món ăn nhập vào
 * @param {Array} menu - Menu array để tìm
 * @returns {string|null} - Tên món ăn chính xác hoặc null
 */
function findDishInMenu(dishInput, menu) {
  if (!menu) return null;
  
  const normalizedInput = normalizeString(dishInput);
  
  for (const item of menu) {
    if (normalizeString(item) === normalizedInput) {
      return item;
    }
  }
  return null;
}

/**
 * Chọn món ăn ngẫu nhiên từ menu
 * @param {Array} menu - Menu array để chọn
 * @returns {string|null} - Tên món ăn ngẫu nhiên hoặc null nếu menu trống
 */
function getRandomDish(menu) {
  if (!menu || menu.length === 0) return null;
  
  const randomIndex = Math.floor(Math.random() * menu.length);
  return menu[randomIndex];
}

/**
 * Thêm đơn đặt hàng
 * @param {string} date - Ngày đặt (YYYY-MM-DD)
 * @param {string} username - Tên người đặt
 * @param {string} dish - Tên món ăn
 * @param {number} quantity - Số lượng
 * @param {boolean} lessRice - Có ít cơm không
 * @returns {Promise<boolean>} - True nếu thành công
 */
async function addOrder(date, username, dish, quantity, lessRice) {
  try {
    const newOrder = new Order({
      date,
      username,
      dish,
      quantity,
      lessRice
    });
    await newOrder.save();
    return true;
  } catch (error) {
    console.error('Lỗi thêm đơn đặt hàng:', error);
    return false;
  }
}

/**
 * Lấy danh sách đơn đặt hàng của một user trong ngày
 * @param {string} date - Ngày (YYYY-MM-DD)
 * @param {string} username - Tên người đặt
 * @returns {Promise<Array>} - Danh sách đơn đặt hàng
 */
async function getUserOrders(date, username) {
  try {
    const orders = await Order.find({ date, username }).sort({ createdAt: 1 });
    return orders.map(order => ({
      dish: order.dish,
      quantity: order.quantity,
      lessRice: order.lessRice
    }));
  } catch (error) {
    console.error('Lỗi lấy đơn đặt hàng của user:', error);
    return [];
  }
}

/**
 * Xóa đơn đặt hàng theo món ăn
 * @param {string} date - Ngày (YYYY-MM-DD)
 * @param {string} username - Tên người đặt
 * @param {string} dish - Tên món ăn
 * @returns {Promise<boolean>} - True nếu thành công
 */
async function removeUserOrder(date, username, dish) {
  try {
    const result = await Order.deleteMany({ date, username, dish });
    return result.deletedCount > 0;
  } catch (error) {
    console.error('Lỗi xóa đơn đặt hàng:', error);
    return false;
  }
}

/**
 * Lấy tổng hợp đơn đặt hàng trong ngày
 * @param {string} date - Ngày (YYYY-MM-DD)
 * @returns {Promise<Object>} - Tổng hợp đơn đặt hàng
 */
async function getDaySummary(date) {
  try {
    const orders = await Order.find({ date });
    const dishCounts = {};
    
    orders.forEach(order => {
      const key = `${order.dish}${order.lessRice ? ' (ít cơm)' : ''}`;
      dishCounts[key] = (dishCounts[key] || 0) + order.quantity;
    });
    
    return dishCounts;
  } catch (error) {
    console.error('Lỗi lấy tổng hợp đơn đặt hàng:', error);
    return {};
  }
}

/**
 * Lấy tổng hợp đơn đặt hàng trong ngày theo từng người
 * @param {string} date - Ngày (YYYY-MM-DD)
 * @returns {Promise<Object>} - Tổng hợp đơn đặt hàng theo người
 */
async function getDayFullSummary(date) {
  try {
    const orders = await Order.find({ date }).sort({ username: 1, createdAt: 1 });
    const userOrders = {};
    
    orders.forEach(order => {
      if (!userOrders[order.username]) {
        userOrders[order.username] = [];
      }
      userOrders[order.username].push({
        dish: order.dish,
        quantity: order.quantity,
        lessRice: order.lessRice
      });
    });
    
    return userOrders;
  } catch (error) {
    console.error('Lỗi lấy tổng hợp đơn đặt hàng đầy đủ:', error);
    return {};
  }
}

/**
 * Xóa toàn bộ dữ liệu đơn đặt hàng
 * @returns {Promise<boolean>} - True nếu thành công
 */
async function resetAllData() {
  try {
    // Xóa toàn bộ orders
    await Order.deleteMany({});
    
    return true;
  } catch (error) {
    console.error('Lỗi reset dữ liệu:', error);
    return false;
  }
}

// Khởi tạo server và database
(async () => {
  try {
    // Kết nối MongoDB
    await connectDB();

    // Tạo server HTTP
    const server = http.createServer(async (req, res) => {
      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Bot is alive');
        console.log(`[${moment().tz(TIME_ZONE).format('DD/MM/YYYY, HH:mm:ss')}] Nhận GET /health`);
        return;
      }
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
            const todayMenu = getMenuByDate(today);

            // Log thời gian và tin nhắn
            const now = moment().tz(TIME_ZONE).format('DD/MM/YYYY, HH:mm:ss');
            console.log(`[${now}] Tin nhắn từ ${username} trong chat ${chatId}: "${msg}"`);

            // Lệnh /getchatid - Lấy chat_id của group
            if (msg === '/getchatid'  && username === 'minhhy_p') {
              await sendMessage(chatId, `🆔 ID của group này là: \`${chatId}\``);
              return res.end('ok');
            }

            // Kiểm tra chat_id
            if (chatId !== ALLOWED_GROUP_ID && username !== 'minhhy_p') {
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

3. **Đặt món ngẫu nhiên**:
   - Gõ: /orderrandom [số lượng] [itcom]
   - Bot sẽ tự động chọn một món ngẫu nhiên từ menu hôm nay.
   - Ví dụ:
     - /orderrandom → Đặt 1 phần món ngẫu nhiên.
     - /orderrandom 2 → Đặt 2 phần món ngẫu nhiên.
     - /orderrandom itcom → Đặt 1 phần món ngẫu nhiên ít cơm.
     - /orderrandom 2 itcom → Đặt 2 phần món ngẫu nhiên ít cơm.

4. **Xem đơn đã đặt**:
   - Gõ: /myorders
   - Ví dụ: Xem bạn đã đặt 2 phần Thịt chiên (ít cơm) hôm nay.

5. **Hủy món**:
   - Gõ: /removeorder <tên món>
   - Ví dụ: /removeorder Thịt chiên → Xóa tất cả đơn Thịt chiên của bạn hôm nay.

6. **Xem tổng hợp đơn hàng**:
   - Gõ: /summary hoặc /fullsummary
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
              if (!todayMenu) {
                await sendMessage(chatId, `📋 **Hôm nay là Chủ nhật**\n\n🚫 Không có menu đặt cơm hôm nay!\n\n📅 Menu sẽ có vào:\n- **Menu 246**: Thứ 2, 4, 6\n- **Menu 357**: Thứ 3, 5, 7`);
                return res.end('ok');
              }
              
              const formattedMenu = todayMenu.length > 0 
                ? todayMenu.map((item, index) => `${index + 1}. ${escapeMarkdown(item)}`).join('\n')
                : 'Chưa có món ăn nào trong menu!';
              
              await sendMessage(chatId, `📋 **Menu hôm nay**:\n${formattedMenu}`);
              return res.end('ok');
            }

            // Lệnh /resetdata - Xóa toàn bộ dữ liệu đơn đặt hàng (chỉ minhhy_p)
            if (msg === '/resetdata') {
              if (username === 'minhhy_p') {
                const success = await resetAllData();
                if (success) {
                  await sendMessage(chatId, `🗑️ Đã xóa toàn bộ dữ liệu đơn đặt hàng!`);
                } else {
                  await sendMessage(chatId, `❌ Lỗi khi reset dữ liệu!`);
                }
              } else {
                await sendMessage(chatId, `ℹ️ Lệnh "${msg}" không hợp lệ. Dùng /menu, /order, /orderrandom, /myorders, /removeorder, /summary, /guide.`);
              }
              return res.end('ok');
            }

            // Lệnh /orderrandom - Đặt món ngẫu nhiên
            if (msg.startsWith('/orderrandom')) {
              if (!todayMenu) {
                await sendMessage(chatId, `🚫 **Hôm nay là Chủ nhật**\n\nKhông thể đặt cơm hôm nay! Menu sẽ có vào thứ 2-7.`);
                return res.end('ok');
              }
              
              const parts = msg.split(' ').slice(1);
              
              // Xử lý số lượng và ít cơm
              let quantity = 1;
              let lessRice = false;
              let validFormat = true;

              // Kiểm tra itcom
              if (parts.includes('itcom')) {
                lessRice = true;
                const nonItcomParts = parts.filter(p => p !== 'itcom');
                
                // Kiểm tra số lượng
                if (nonItcomParts.length === 1 && /^\d+$/.test(nonItcomParts[0])) {
                  quantity = parseInt(nonItcomParts[0], 10);
                } else if (nonItcomParts.length > 1) {
                  validFormat = false;
                }
              } else {
                // Kiểm tra số lượng (không có itcom)
                if (parts.length === 1 && /^\d+$/.test(parts[0])) {
                  quantity = parseInt(parts[0], 10);
                } else if (parts.length > 1) {
                  validFormat = false;
                }
              }

              if (!validFormat) {
                await sendMessage(chatId, '❗ Dùng đúng format: /orderrandom [số lượng] [itcom]\nVí dụ: /orderrandom, /orderrandom 2, /orderrandom itcom, /orderrandom 2 itcom');
                return res.end('ok');
              }

              // Kiểm tra số lượng là số nguyên dương
              if (quantity <= 0) {
                await sendMessage(chatId, '❗ Số lượng phải là số nguyên dương!\nDùng: /orderrandom [số lượng] [itcom]');
                return res.end('ok');
              }

              // Chọn món ngẫu nhiên
              const randomDish = getRandomDish(todayMenu);
              if (!randomDish) {
                await sendMessage(chatId, `❌ Không thể chọn món ngẫu nhiên từ menu hôm nay!`);
                return res.end('ok');
              }

              // Lưu đơn đặt hàng
              const success = await addOrder(today, username, randomDish, quantity, lessRice);
              if (success) {
                const riceNote = lessRice ? ' (ít cơm)' : '';
                await sendMessage(chatId, `🎲 Đã đặt ngẫu nhiên ${quantity} phần "${escapeMarkdown(randomDish)}"${riceNote} cho ${escapeMarkdown(username)}!`);
              } else {
                await sendMessage(chatId, `❌ Lỗi khi đặt món! Vui lòng thử lại.`);
              }
              return res.end('ok');
            }

            // Lệnh /order - Đặt món
            if (msg.startsWith('/order')) {
              if (!todayMenu) {
                await sendMessage(chatId, `🚫 **Hôm nay là Chủ nhật**\n\nKhông thể đặt cơm hôm nay! Menu sẽ có vào thứ 2-7.`);
                return res.end('ok');
              }
              
              const parts = msg.split(' ').slice(1);
              if (parts.length === 0) {
                await sendMessage(chatId, '❗ Dùng đúng format: /order <tên món> [số lượng] [itcom]\nVí dụ: /order Thịt chiên 2 itcom');
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
              const dishInput = dishParts.join(' ').trim();
              if (!dishInput) {
                await sendMessage(chatId, '❗ Vui lòng nhập tên món ăn!\nDùng: /order <tên món> [số lượng] [itcom]');
                return res.end('ok');
              }

              // Kiểm tra format: không được có tham số thừa
              const expectedParts = lessRice ? (quantity > 1 ? parts.length - 2 : parts.length - 1) : (quantity > 1 ? parts.length - 1 : parts.length);
              if (dishParts.length !== expectedParts) {
                await sendMessage(chatId, `❗ Format sai! Dùng: /order <tên món> [số lượng] [itcom]\nVí dụ: /order ${dishInput} ${quantity} ${lessRice ? 'itcom' : ''}`.trim());
                return res.end('ok');
              }

              // Kiểm tra số lượng là số nguyên dương
              if (quantity <= 0) {
                await sendMessage(chatId, '❗ Số lượng phải là số nguyên dương!\nDùng: /order <tên món> [số lượng] [itcom]');
                return res.end('ok');
              }

              // Tìm món trong menu
              const dish = findDishInMenu(dishInput, todayMenu);
              if (!dish) {
                await sendMessage(chatId, `❌ Không có món "${escapeMarkdown(dishInput)}" trong menu! Dùng /menu để xem danh sách.`);
                return res.end('ok');
              }

              // Lưu đơn đặt hàng
              const success = await addOrder(today, username, dish, quantity, lessRice);
              if (success) {
                const riceNote = lessRice ? ' (ít cơm)' : '';
                await sendMessage(chatId, `🍽️ Đã đặt ${quantity} phần "${escapeMarkdown(dish)}"${riceNote} cho ${escapeMarkdown(username)}!`);
              } else {
                await sendMessage(chatId, `❌ Lỗi khi đặt món! Vui lòng thử lại.`);
              }
              return res.end('ok');
            }

            // Lệnh /myorders - Xem đơn đặt hàng của username
            if (msg === '/myorders') {
              const todayOrders = await getUserOrders(today, username);
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
              if (parts.length === 0) {
                await sendMessage(chatId, '❗ Dùng đúng format: /removeorder <tên món>\nVí dụ: /removeorder Thịt chiên');
                return res.end('ok');
              }

              const dishInput = parts.join(' ').trim();
              if (!dishInput) {
                await sendMessage(chatId, '❗ Vui lòng nhập tên món để xóa!\nDùng: /removeorder <tên món>');
                return res.end('ok');
              }

              // Kiểm tra format: không được có tham số thừa
              if (parts.length !== parts.join(' ').trim().split(' ').length) {
                await sendMessage(chatId, `❗ Format sai! Dùng: /removeorder <tên món>\nVí dụ: /removeorder ${dishInput}`);
                return res.end('ok');
              }

              // Tìm món trong menu hiện tại
              const dish = findDishInMenu(dishInput, todayMenu);
              if (!dish) {
                await sendMessage(chatId, `⚠️ Không có món "${escapeMarkdown(dishInput)}" trong menu hoặc hôm nay không có menu!`);
                return res.end('ok');
              }

              // Xóa đơn món
              const success = await removeUserOrder(today, username, dish);
              if (success) {
                await sendMessage(chatId, `✅ Đã xóa đơn "${escapeMarkdown(dish)}" của ${escapeMarkdown(username)}!`);
              } else {
                await sendMessage(chatId, `⚠️ Bạn chưa đặt món "${escapeMarkdown(dishInput)}" hôm nay!`);
              }
              return res.end('ok');
            }

            // Lệnh /summary - Xem tổng hợp đơn đặt hàng trong ngày
            if (msg === '/summary') {
              const dishCounts = await getDaySummary(today);
              const summary = Object.entries(dishCounts).length > 0
                ? Object.entries(dishCounts)
                    .map(([dish, count]) => `- ${dish}: ${count} phần`)
                    .join('\n')
                : 'Chưa có đơn đặt hàng nào hôm nay!';
              await sendMessage(chatId, `📊 **Tổng hợp đơn đặt hàng hôm nay (${today})**:\n${summary}`);
              return res.end('ok');
            }

            // Lệnh /fullsummary - Xem tổng hợp đơn đặt hàng trong ngày theo từng người
            if (msg === '/fullsummary') {
              const todayOrders = await getDayFullSummary(today);
              if (Object.keys(todayOrders).length === 0) {
                await sendMessage(chatId, `📊 **Tổng hợp đơn đặt hàng hôm nay (${today})**:\nChưa có đơn đặt hàng nào hôm nay!`);
                return res.end('ok');
              }

              const summaryLines = [];
              for (const user in todayOrders) {
                const userOrders = todayOrders[user];
                if (userOrders.length === 0) continue;

                const orderList = userOrders
                  .map(({ dish, quantity, lessRice }) => 
                    `- ${escapeMarkdown(dish)}: ${quantity} phần${lessRice ? ' (ít cơm)' : ''}`)
                  .join('\n');
                summaryLines.push(`👤 **${escapeMarkdown(user)}**:\n${orderList}`);
              }

              const summary = summaryLines.length > 0
                ? summaryLines.join('\n\n')
                : 'Chưa có đơn đặt hàng nào hôm nay!';
              await sendMessage(chatId, `📊 **Tổng hợp đơn đặt hàng hôm nay (${today})**:\n${summary}`);
              return res.end('ok');
            }

            // Xử lý các lệnh/tin nhắn khác
            await sendMessage(chatId, `ℹ️ Lệnh "${msg}" không hợp lệ. Dùng /menu, /order, /orderrandom, /myorders, /removeorder, /summary, /guide.`);
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

    /**
     * Hàm gửi tin nhắn
     * @param {string} chatId - ID của chat
     * @param {string} text - Nội dung tin nhắn
     * @returns {Promise<Object>} - Kết quả gửi tin nhắn
     */
    async function sendMessage(chatId, text, timeoutMs = 10000) {
      const url = `${API}/sendMessage`;
      const body = { chat_id: chatId, text, parse_mode: 'Markdown' };
      const headers = { 'Content-Type': 'application/json' };

      try {
        console.log('====================[SEND MESSAGE REQUEST]====================');
        console.log(`→ URL: ${url}`);
        console.log(`→ Timeout: ${timeoutMs}ms`);
        console.log('→ Headers:', headers);
        console.log('→ Body:', JSON.stringify(body, null, 2));
        console.log('==============================================================');

        // Tạo AbortController để handle timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        console.log('← HTTP status:', response.status, response.statusText);

        const result = await response.json();
        console.log('← Response JSON:', JSON.stringify(result, null, 2));

        if (!result.ok) {
          console.error(`❌ Lỗi Telegram API: ${result.description}`);
          throw new Error(`Telegram API error: ${result.description}`);
        }

        console.log(`✅ Gửi tin nhắn thành công tới ${chatId}: "${text}"`);
        return result;
      } catch (error) {
        if (error.name === 'AbortError') {
          console.error(`⏰ Timeout gửi tin nhắn sau ${timeoutMs}ms tới ${chatId}`);
          throw new Error(`Request timeout after ${timeoutMs}ms`);
        }
        console.error('💥 Lỗi gửi tin nhắn:', error);
        throw error;
      }
    }

    /**
     * Thiết lập webhook
     * @returns {Promise<void>}
     */
    async function setWebhook() {
      try {
        const webhookUrl = process.env.RENDER_EXTERNAL_URL || `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`;
        if (!webhookUrl) {
          console.warn('Chưa có RENDER_EXTERNAL_URL hoặc RENDER_EXTERNAL_HOSTNAME. Chạy local hoặc thiết lập webhook thủ công.');
          return;
        }

        // Tạo AbortController để handle timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 giây timeout

        const response = await fetch(`${API}/setWebhook?url=${webhookUrl}`, {
          signal: controller.signal
        });

        // Clear timeout nếu request thành công
        clearTimeout(timeoutId);

        const result = await response.json();
        console.log('Webhook thiết lập:', result);
      } catch (error) {
        if (error.name === 'AbortError') {
          console.error('Timeout khi thiết lập webhook sau 10 giây');
        } else {
          console.error('Lỗi thiết lập webhook:', error);
        }
      }
    }

    await setWebhook();

  } catch (error) {
    console.error('Lỗi khởi tạo:', error);
  }
})();