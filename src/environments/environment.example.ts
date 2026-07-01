/**
 * @file Template for the production Firebase environment config. Copy this file
 * to `environment.ts` and fill in the values (Firebase console → Project settings
 * → General → Your apps). The Firebase web config is public by design; the Giphy
 * API key and the guest account credentials are real secrets kept out of version
 * control, which is why `environment.ts` is gitignored.
 */
export const environment = {
  firebaseConfig: {
    apiKey: 'YOUR_API_KEY',
    authDomain: 'YOUR_PROJECT.firebaseapp.com',
    projectId: 'YOUR_PROJECT_ID',
    storageBucket: 'YOUR_PROJECT.firebasestorage.app',
    messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
    appId: 'YOUR_APP_ID',
  },
  giphyApiKey: 'YOUR_GIPHY_API_KEY',
  guestEmail: 'GUEST_ACCOUNT_EMAIL',
  guestPassword: 'GUEST_ACCOUNT_PASSWORD',
};
