import type { DataService } from './interface/dataService';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');

// Builds an API URL using the same base for requests and uploaded images.
export function apiUrl(path: string) {
  return `${API_BASE_URL}/${path.replace(/^\/+/, '')}`;
}

export class ApiError extends Error {
  // Retains the status and response body so callers can handle API failures by status.
  constructor(public status: number, public body: string) {
    super(`API request failed (${status})`);
    this.name = 'ApiError';
  }
}

// Normalizes API URLs and JSON headers, then decodes successful responses and reports HTTP errors.
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body !== undefined && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(apiUrl(path), {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }

  const text = await response.text();
  return text ? JSON.parse(text) as T : undefined as T;
}

export const dataService: DataService = {
  // Fetches a resource with optional request settings such as an abort signal.
  get<T>(path: string, options?: RequestInit) {
    return request<T>(path, { ...options, method: 'GET' });
  },
  // Sends a JSON payload to create or import records.
  post<T>(path: string, data: unknown, options?: RequestInit) {
    return request<T>(path, { ...options, method: 'POST', body: JSON.stringify(data) });
  },
  // Lets the browser choose the multipart boundary for an upload.
  postForm<T>(path: string, form: FormData, options?: RequestInit) {
    return request<T>(path, { ...options, method: 'POST', body: form });
  },
  // Replaces a resource with a JSON payload and forwards precondition headers.
  put<T>(path: string, data: unknown, options?: RequestInit) {
    return request<T>(path, { ...options, method: 'PUT', body: JSON.stringify(data) });
  },
  // Sends a JSON payload containing a partial update.
  patch<T>(path: string, data: unknown, options?: RequestInit) {
    return request<T>(path, { ...options, method: 'PATCH', body: JSON.stringify(data) });
  },
  // Updates a resource with form fields and an optional file.
  patchForm<T>(path: string, form: FormData, options?: RequestInit) {
    return request<T>(path, { ...options, method: 'PATCH', body: form });
  },
  // Deletes a resource and allows the endpoint to return an empty response.
  delete<T = void>(path: string, options?: RequestInit) {
    return request<T>(path, { ...options, method: 'DELETE' });
  },
};
