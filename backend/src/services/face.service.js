import axios from 'axios';
import { config } from '../config/env.js';

const client = axios.create({
  baseURL: config.faceServiceUrl,
  timeout: 10000,
  headers: {
    'X-Internal-Service-Key': config.internalServiceKey,
    'Content-Type': 'application/json',
  },
});

export class FaceService {
  /**
   * Health status of the Python microservice
   */
  static async getHealth() {
    try {
      const res = await client.get('/health', { timeout: 1000 });
      return res.data;
    } catch (error) {
      return {
        status: 'OFFLINE',
        modelStatus: 'not_running',
        message: 'Python Face Microservice is not running yet on http://127.0.0.1:8000',
      };
    }
  }

  /**
   * Request face detection and embedding generation (Enrollment)
   */
  static async detectAndEmbed(imageBase64) {
    try {
      const res = await client.post('/face/detect-and-embed', {
        image_base64: imageBase64,
      });
      return res.data;
    } catch (error) {
      if (error.response?.data?.detail) {
        const err = new Error(error.response.data.detail);
        err.statusCode = error.response.status || 422;
        throw err;
      }
      throw new Error(`Biometric service error: ${error.message}`);
    }
  }

  /**
   * Request face verification comparison against enrolled embedding
   */
  static async verifyFace(imageBase64, enrolledEmbedding) {
    try {
      const res = await client.post('/face/verify', {
        image_base64: imageBase64,
        enrolled_embedding: enrolledEmbedding,
      });
      return res.data;
    } catch (error) {
      if (error.response?.data?.detail) {
        const err = new Error(error.response.data.detail);
        err.statusCode = error.response.status || 422;
        throw err;
      }
      throw new Error(`Biometric verification failed: ${error.message}`);
    }
  }
}
