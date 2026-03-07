import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

type TurnstileRenderOptions = {
  sitekey: string;
  theme?: 'light' | 'dark';
  size?: 'normal' | 'compact' | 'flexible';
  callback?: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
};

declare global {
  interface Window {
    turnstile?: {
      render: (
        selectorOrElement: string | HTMLElement,
        options: TurnstileRenderOptions,
      ) => string;
      reset: (widgetId?: string) => void;
      getResponse: (widgetId?: string) => string;
    };
  }
}

type UseTurnstileOptions = {
  containerId: string;
  theme?: 'light' | 'dark';
  size?: 'normal' | 'compact' | 'flexible';
};

type UseTurnstileResult = {
  token: string | null;
  hasSiteKey: boolean;
  getToken: () => string;
  reset: () => void;
};

export const useTurnstile = ({
  containerId,
  theme = 'dark',
  size = 'normal',
}: UseTurnstileOptions): UseTurnstileResult => {
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
  const [token, setToken] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey) {
      return;
    }

    let cancelled = false;

    const renderWidget = () => {
      if (cancelled || widgetIdRef.current) {
        return;
      }

      if (!window.turnstile) {
        window.setTimeout(renderWidget, 120);
        return;
      }

      const container = document.getElementById(containerId);
      if (!container) {
        window.setTimeout(renderWidget, 120);
        return;
      }

      widgetIdRef.current = window.turnstile.render(`#${containerId}`, {
        sitekey: siteKey,
        theme,
        size,
        callback: (nextToken: string) => {
          tokenRef.current = nextToken;
          setToken(nextToken);
        },
        'expired-callback': () => {
          tokenRef.current = null;
          setToken(null);
        },
        'error-callback': () => {
          tokenRef.current = null;
          setToken(null);
        },
      });
    };

    renderWidget();

    return () => {
      cancelled = true;
      tokenRef.current = null;
      setToken(null);
      widgetIdRef.current = null;
    };
  }, [containerId, siteKey, size, theme]);

  const getToken = useCallback(() => {
    const hiddenToken =
      (
        document.querySelector(
          `#${containerId} textarea[name="cf-turnstile-response"]`,
        ) as HTMLTextAreaElement | null
      )?.value ?? '';
    const widgetToken =
      window.turnstile?.getResponse(widgetIdRef.current ?? undefined) ?? '';
    const fallbackToken = window.turnstile?.getResponse() ?? '';

    return (
      tokenRef.current ||
      token ||
      hiddenToken ||
      widgetToken ||
      fallbackToken
    ).trim();
  }, [containerId, token]);

  const reset = useCallback(() => {
    tokenRef.current = null;
    setToken(null);
    window.turnstile?.reset(widgetIdRef.current ?? undefined);
  }, []);

  return {
    token,
    hasSiteKey: Boolean(siteKey),
    getToken,
    reset,
  };
};
