import type { TikTokAccountStatus } from './types';

function isAllowedOAuthOrigin(origin: string): boolean {
  if (!origin) return false;
  if (origin === window.location.origin) return true;
  try {
    const parsed = new URL(origin);
    return (
      parsed.hostname.endsWith('.run.app') ||
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1'
    );
  } catch {
    return false;
  }
}

export async function startTikTokOAuthPopup(options: {
  scopeMode?: 'full' | 'draft';
  onSuccess: (username: string | null) => Promise<void> | void;
  onError: (message: string, status?: TikTokAccountStatus) => void;
}): Promise<void> {
  const scopeMode = options.scopeMode ?? 'full';
  try {
    const res = await fetch(
      `/api/tiktok/auth-url?scopeMode=${encodeURIComponent(scopeMode)}`,
    );
    const json = (await res.json().catch(() => ({}))) as {
      configured?: boolean;
      authUrl?: string;
      error?: string;
      status?: TikTokAccountStatus;
    };

    if (!res.ok || json.configured === false || !json.authUrl) {
      options.onError(
        json.error ||
          'Kredensial TikTok (TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET) belum diatur di Settings > Secrets.',
        json.status,
      );
      return;
    }

    const popup = window.open(
      json.authUrl,
      'tiktok_oauth',
      'width=600,height=720,menubar=no,toolbar=no,location=yes,status=no',
    );

    if (!popup) {
      options.onError(
        'Popup login TikTok diblokir oleh browser. Izinkan popup untuk situs ini lalu coba lagi.',
      );
      return;
    }

    const cleanup = () => {
      window.removeEventListener('message', handleMessage);
      window.clearInterval(closedPoll);
    };

    const handleMessage = (event: MessageEvent) => {
      if (!isAllowedOAuthOrigin(event.origin)) return;
      const data = event.data as
        | { type?: string; username?: string | null; error?: string }
        | undefined;
      if (!data?.type) return;

      if (data.type === 'TIKTOK_OAUTH_SUCCESS') {
        cleanup();
        void options.onSuccess(data.username ?? null);
      } else if (data.type === 'TIKTOK_OAUTH_ERROR') {
        cleanup();
        options.onError(data.error || 'Otorisasi TikTok gagal.');
      }
    };

    const closedPoll = window.setInterval(() => {
      if (popup.closed) {
        cleanup();
      }
    }, 600);

    window.addEventListener('message', handleMessage);
  } catch {
    options.onError('Gagal memulai koneksi OAuth TikTok ke server.');
  }
}
