import { Platform, Clipboard } from 'react-native';

export const copyToClipboard = async (text: string): Promise<void> => {
  try {
    if (Platform.OS === 'web') {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
    } else {
      Clipboard.setString(text);
    }
  } catch (error) {
    console.error('Copy to clipboard error:', error);
    throw error;
  }
};
