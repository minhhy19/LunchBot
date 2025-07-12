import mongoose from 'mongoose';

/**
 * Schema cho Order - lưu từng đơn đặt hàng
 */
const orderSchema = new mongoose.Schema({
  date: {
    type: String,
    required: true,
    match: /^\d{4}-\d{2}-\d{2}$/ // Format: YYYY-MM-DD
  },
  username: {
    type: String,
    required: true,
    trim: true
  },
  dish: {
    type: String,
    required: true,
    trim: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  lessRice: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Tạo compound index cho việc tìm kiếm nhanh
orderSchema.index({ date: 1, username: 1 });
orderSchema.index({ date: 1 });

// Export model
export const Order = mongoose.model('Order', orderSchema); 