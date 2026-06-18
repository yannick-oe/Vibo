/**
 * @file Template for the development Firebase environment config. Copy this file
 * to `environment.development.ts` and replace the placeholders with your Firebase
 * web config (Firebase console → Project settings → General → Your apps). These
 * values are public client identifiers, not secrets; access is enforced by rules.
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
};
