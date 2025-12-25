import { useEffect, useRef } from 'preact/hooks';
import { renderSVG } from 'uqr';

type Props = {
  value: string;
  size?: number;
};

export function QRCode({ value, size = 240 }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) {
      return;
    }
    // renderSVG が SVG の文字列を返す想定なので innerHTML で挿入する
    // value が変わるたびに上書きする
    const svg = renderSVG(value, { ecc: 'Q', border: 3 });
    ref.current.innerHTML = svg;
    // サイズ指定が必要ならコンテナにスタイルで調整
    if (size) {
      ref.current.style.width = `${size}px`;
      ref.current.style.height = `${size}px`;
      ref.current.style.margin = '30px auto';
      ref.current.querySelector('svg')?.setAttribute('width', String(size));
      ref.current.querySelector('svg')?.setAttribute('height', String(size));
    }
  }, [value, size]);

  return <div ref={ref} aria-hidden='true' />;
}
