export function getToken(): string | null {
  return localStorage.getItem('calbridge_token');
}

export function setToken(token: string) {
  localStorage.setItem('calbridge_token', token);
}

export function removeToken() {
  localStorage.removeItem('calbridge_token');
}

export function getCurrentUser(): { id: string; username: string; role: string } | null {
  const userJson = localStorage.getItem('calbridge_user');
  if (!userJson) return null;
  try {
    return JSON.parse(userJson);
  } catch {
    return null;
  }
}

export function setCurrentUser(user: { id: string; username: string; role: string } | null) {
  if (user) {
    localStorage.setItem('calbridge_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('calbridge_user');
  }
}

interface ApiOptions extends RequestInit {
  json?: any;
}

export async function apiCall(endpoint: string, options: ApiOptions = {}) {
  const headers = new Headers(options.headers || {});
  
  const token = getToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (options.json) {
    headers.set('Content-Type', 'application/json');
    options.body = JSON.stringify(options.json);
  }

  const response = await fetch(endpoint, {
    ...options,
    headers
  });

  if (response.status === 401) {
    removeToken();
    setCurrentUser(null);
    window.location.reload();
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `HTTP ${response.status}`);
  }

  return response.json();
}
