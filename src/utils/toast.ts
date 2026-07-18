export function showToast(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') {
  if (typeof window !== 'undefined' && window.showToast) {
    window.showToast(message, type);
  } else {
    console.log(`[Toast Fallback - ${type}] ${message}`);
  }
}
