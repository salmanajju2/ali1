// Lightweight legacy resolver for historical Telegram slip identifiers.
// All new slip uploads are handled directly via Cloudinary.
import { API_ORIGIN } from './apiConfig';
import { refreshSessionToken } from '../context/AuthContext';

const PROXY_SERVER = API_ORIGIN;

const proxyFetch = async (url: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  const token = await refreshSessionToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...init, headers, credentials: 'omit' });
};

/**
 * Gets a temporary file URL for legacy Telegram slips (backward compatibility)
 */
export const getTelegramPhotoUrl = async (fileId: string): Promise<string | null> => {
  if (!fileId) return null;

  try {
    const response = await proxyFetch(`${PROXY_SERVER}/telegram/getFileUrl?fileId=${encodeURIComponent(fileId)}`);
    if (response.ok) {
      const data = await response.json();
      if (data.proxyUrl || data.url) {
        return data.proxyUrl?.startsWith('/')
          ? `${PROXY_SERVER}${data.proxyUrl}`
          : `${PROXY_SERVER}/telegram/fetchFile?url=${encodeURIComponent(data.url)}`;
      }
    }
  } catch (error) {
    console.warn('[Telegram Fetch] Could not resolve legacy file via proxy:', error);
  }
  return null;
};

