import { GoogleGenAI } from '@google/genai';
import { JSONFilePreset } from 'lowdb/node';

// Lưu lịch sử hội thoại tiếng Anh (file riêng, không đụng MongoDB của lunch)
const db = await JSONFilePreset('english_db.json', { conversation: [] });

const MAX_HISTORY = 20;

// Lazy init để chắc chắn dotenv đã load xong (import trong index.js chạy trước dotenv.config())
let client = null;
function getClient() {
  if (!client) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
}

const MODEL = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const SYSTEM_PROMPT = `Bạn là trợ lý dạy tiếng Anh cho người Việt qua Telegram.
- Giải thích bằng tiếng Việt, ví dụ bằng tiếng Anh.
- Trả lời ngắn gọn, dùng emoji hợp lý, KHÔNG dùng markdown (không **, không ##) vì tin nhắn hiển thị dạng text thường.
- Khi sửa lỗi: đưa câu đã sửa, giải thích lỗi, và cách nói tự nhiên hơn nếu có.`;

/** Gọi Gemini với 1 câu hỏi đơn */
async function ask(prompt) {
  const response = await getClient().models.generateContent({
    model: MODEL(),
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      maxOutputTokens: 1024,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  return response.text ?? '';
}

/** Chat hội thoại có nhớ lịch sử */
async function chat(userText) {
  db.data.conversation.push({ role: 'user', content: userText });
  if (db.data.conversation.length > MAX_HISTORY) {
    db.data.conversation = db.data.conversation.slice(-MAX_HISTORY);
  }

  const contents = db.data.conversation.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const response = await getClient().models.generateContent({
    model: MODEL(),
    contents,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      maxOutputTokens: 1024,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const reply = response.text ?? '';
  db.data.conversation.push({ role: 'assistant', content: reply });
  await db.write();
  return reply;
}

const HELP_TEXT = `🤫 Tính năng học tiếng Anh (ẩn):

/eng <câu tiếng Anh> — trò chuyện luyện tiếng Anh (bot nhớ 20 lượt gần nhất)
/endtalk — xóa lịch sử hội thoại, bắt đầu chủ đề mới
/fix <câu> — sửa ngữ pháp
/word <từ> — tra & giải thích từ vựng
/translate <đoạn> — dịch Việt ↔ Anh
/enghelp — xem lại hướng dẫn này`;

/**
 * Xử lý các lệnh học tiếng Anh (ẩn — caller phải tự kiểm tra username trước).
 * @param {string} msg - Tin nhắn
 * @param {Function} reply - Hàm gửi trả lời (text) => Promise
 * @returns {Promise<boolean>} - true nếu tin nhắn là lệnh tiếng Anh và đã xử lý
 */
export async function handleEnglish(msg, reply) {
  try {
    if (msg === '/enghelp') {
      await reply(HELP_TEXT);
      return true;
    }

    if (msg === '/endtalk') {
      db.data.conversation = [];
      await db.write();
      await reply('✅ Đã xóa lịch sử hội thoại tiếng Anh. Dùng /eng để bắt đầu lại!');
      return true;
    }

    if (msg === '/eng' || msg.startsWith('/eng ')) {
      const text = msg.slice(4).trim();
      if (!text) {
        await reply('Cú pháp: /eng <câu tiếng Anh>\nVí dụ: /eng Hi! Let\'s talk about movies');
        return true;
      }
      await reply(await chat(text));
      return true;
    }

    if (msg.startsWith('/fix')) {
      const text = msg.slice(4).trim();
      if (!text) {
        await reply('Cú pháp: /fix <câu tiếng Anh cần sửa>');
        return true;
      }
      await reply(await ask(`Sửa lỗi câu tiếng Anh sau:\n"${text}"`));
      return true;
    }

    if (msg.startsWith('/word')) {
      const text = msg.slice(5).trim();
      if (!text) {
        await reply('Cú pháp: /word <từ cần tra>');
        return true;
      }
      await reply(await ask(`Giải thích từ tiếng Anh "${text}": nghĩa, phiên âm IPA, loại từ, 2 ví dụ, collocation phổ biến, từ đồng nghĩa.`));
      return true;
    }

    if (msg.startsWith('/translate')) {
      const text = msg.slice(10).trim();
      if (!text) {
        await reply('Cú pháp: /translate <đoạn cần dịch>');
        return true;
      }
      await reply(await ask(`Dịch đoạn sau (Việt→Anh hoặc Anh→Việt tùy input), kèm 2-3 cách diễn đạt khác nhau (formal/informal):\n"${text}"`));
      return true;
    }

    return false; // không phải lệnh tiếng Anh
  } catch (error) {
    console.error('Lỗi tính năng tiếng Anh:', error);
    await reply('😥 Có lỗi khi gọi AI, thử lại sau nhé.');
    return true;
  }
}
