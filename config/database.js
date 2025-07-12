import mongoose from 'mongoose';

/**
 * Kết nối đến MongoDB
 * @returns {Promise<void>}
 */
export const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lunchbot';
    
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
      family: 4 // Use IPv4, skip trying IPv6
    };

    await mongoose.connect(mongoURI, options);
    console.log('✅ Kết nối MongoDB thành công!');
    
    // Lắng nghe các sự kiện kết nối
    mongoose.connection.on('error', (error) => {
      console.error('❌ Lỗi kết nối MongoDB:', error);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB đã ngắt kết nối');
    });
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('💤 Đã đóng kết nối MongoDB');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Lỗi kết nối MongoDB:', error);
    process.exit(1);
  }
}; 