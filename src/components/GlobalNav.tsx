import { Link } from "wouter-preact";

const GlobalNav = () => {
  return (
    <nav>
      <ul>
        <li>
          <Link href='/'>ホーム</Link>
        </li>
        <li>
          <Link href='/t'>チケット</Link>
        </li>
        <li>
          <a href='#'>パンフレット</a>
        </li>
        <li>
          <Link href='/performances'>公演一覧</Link>
        </li>
        <li>
          <a href='#'>スケジュール</a>
        </li>
        <li>
          <a href='#'>ご来場の注意</a>
        </li>
        <li>
          <a href='#'>校内マップ</a>
        </li>
        <li>
          <a href='#'>アクセス</a>
        </li>
        <li>
          <a href='#'>FAQ</a>
        </li>
        <li>
          <a href='#'>お問い合わせ</a>
        </li>
      </ul>
    </nav>
  );
};

export default GlobalNav;