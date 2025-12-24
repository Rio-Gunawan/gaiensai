import { Alert } from './components/ui/alert';
import './assets/css/app.css';
import { Footer } from './components/layout/footer';
import { Header } from './components/layout/header';

import { BiSolidFoodMenu } from 'react-icons/bi';
import { PiMicrophoneStageFill } from 'react-icons/pi';
import { GrSchedulePlay } from 'react-icons/gr';
import { IoIosWarning } from 'react-icons/io';
import { IoMdTrain } from 'react-icons/io';
import { FaMapLocationDot } from 'react-icons/fa6';
import { FaQuestionCircle } from 'react-icons/fa';

export const App = () => {
  return (
    <>
      <Header />
      <section className='first-view'>
        <div className='first-view-content'>
          <h1>外苑祭 2026</h1>
          <p>2026/8/29~30 東京都立青山高校</p>
        </div>
        <div className='scroll'>
          <span>Scroll</span>
        </div>
      </section>
      <Alert>
        <p>
          外苑祭は
          <strong>
            青山高校生徒から招待された人、または抽選で当選した中学生のみ
          </strong>
          参加可能です。一般の方のご入場はお断りいたします。
        </p>
      </Alert>
      <main>
        <section className='normal-section'>
          <h2>チケット</h2>
          <p>
            招待券は、お使いのデバイスで表示したことのあるもののみ表示できます。まだ閲覧していない場合は、招待URLよりアクセスしてください。
          </p>
          <ul>
            <li>
              <a href='#'>招待券</a>
            </li>
            <li>
              <a href='#'>中学生券</a>
            </li>
            <li>
              <a href='#'>当日券</a>
            </li>
          </ul>
        </section>
        <section className='button-link-section'>
          <a href='#' className='button-link'>
            <BiSolidFoodMenu />
            デジタルパンフレット
          </a>
          <a href='#' className='button-link'>
            <PiMicrophoneStageFill />
            公演一覧
          </a>
          <a href='#' className='button-link'>
            <GrSchedulePlay />
            スケジュール
          </a>
        </section>
        <section className='normal-section'>
          <h2>外苑祭とは</h2>
          <h3 className='catch-copy'>
            来場者数5000人を誇る、<span>青高の夏の象徴</span>
          </h3>
          <p>
            外苑祭とは、青山高校の生徒が主体となって企画・運営する文化祭です。毎年8月下旬に開催され、多くの来場者で賑う伝統行事です。
            全21クラス全てが演劇またはミュージカルを披露し、体育館では部活のパフォーマンスが行われます。
          </p>
        </section>
        <section>
          <h2>ご来場の皆様へ</h2>
          <div className='button-link-section'>
            <a href='#' className='button-link'>
              <IoIosWarning />
              ご来場の注意
            </a>
            <a href='#' className='button-link'>
              <FaMapLocationDot />
              校内マップ
            </a>
            <a href='#' className='button-link'>
              <IoMdTrain />
              アクセス
            </a>
            <a href='#' className='button-link'>
              <FaQuestionCircle />
              FAQ
            </a>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
};
