import mongoose from 'mongoose';

let isConnected = false;

/**
 * Connect to MongoDB using the MONGODB_URI environment variable.
 *
 * If MONGODB_URI is missing, empty, or the connection fails, this function
 * resolves gracefully — the bot continues to start without database support.
 *
 * Never logs the URI or any credentials.
 * @returns {Promise<boolean>} true if connected, false otherwise
 */
export async function connectDatabase() {
  const uri = process.env.MONGODB_URI;

  if (!uri || uri.trim() === '') {
    console.log('⚠️ MongoDB is unavailable. Starting without database support.');
    return false;
  }

  // Suppress mongoose's internal debug output that could leak connection details
  mongoose.set('debug', false);

  try {
    mongoose.connection.on('error', (err) => {
      // Log a sanitized message — never the full error which may contain the URI
      console.error('[MONGODB ERROR] Connection error:', err.name);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[MONGODB] Disconnected from the database.');
      isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      console.log('[MONGODB] Reconnected to the database.');
      isConnected = true;
    });

    await mongoose.connect(uri);

    isConnected = true;
    console.log('✅ MongoDB connected.');
    return true;
  } catch (err) {
    // Log a sanitized message — never the full error which may contain the URI
    console.error('[MONGODB ERROR] Failed to connect:', err.name);
    console.log('⚠️ MongoDB is unavailable. Starting without database support.');
    return false;
  }
}

/**
 * Returns whether MongoDB is currently connected.
 * @returns {boolean}
 */
export function isDatabaseConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

/**
 * Gracefully close the MongoDB connection.
 */
export async function disconnectDatabase() {
  if (!isConnected) return;
  try {
    await mongoose.disconnect();
    console.log('[MONGODB] Connection closed.');
  } catch (err) {
    console.error('[MONGODB ERROR] Error closing connection:', err.name);
  }
}

export default mongoose;
