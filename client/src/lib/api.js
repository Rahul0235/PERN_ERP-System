// Base URL for backend API requests
const BASE =
    import.meta.env.VITE_API_URL ||
    'http://localhost:8080/api';

// Reusable API request function
export async function api(path, options = {}) {
    const token = localStorage.getItem('token');

    const response = await fetch(`${BASE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',

            ...(token
                ? { Authorization: `Bearer ${token}` }
                : {}),

            ...(options.headers || {}),
        },
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error || 'Request failed');
    }

    return data;
}

// Format amounts as Indian Rupees
export const money = (amount) =>
    new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
    }).format(Number(amount || 0));