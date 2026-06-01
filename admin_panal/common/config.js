/**
 * API base URL for Flask backend (email + admin API).
 * - Same host when deployed on Render / single server
 * - Set window.BIOATT_API_URL before scripts load if frontend is on Firebase Hosting
 */
export function getApiBase() {
  if (typeof window === 'undefined') return '';
  const custom = window.BIOATT_API_URL;
  if (custom && typeof custom === 'string') {
    return custom.replace(/\/$/, '');
  }
  return window.location.origin;
}
