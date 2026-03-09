import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import styles from './Scan.module.css';
import QrScanner from 'qr-scanner';
import {
  decodeAndVerifyTicket,
  type TicketDecodedDisplaySeed,
} from '../../features/tickets/ticketCodeDecode';
import {
  preloadScanTicketMaster,
  resolveScanTicketDisplay,
  type ResolvedScanTicketDisplay,
  type ScanTicketMaster,
} from '../../features/tickets/scanTicketMaster';
import Alert from '../../components/ui/Alert';
import { FaCircleCheck, FaCircleXmark } from 'react-icons/fa6';

const TIMEOUT_RESCAN = 4000;

const Scan = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoWrapperRef = useRef<HTMLDivElement | null>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const isProcessingRef = useRef(false);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [lastRawValue, setLastRawValue] = useState<string>('');
  const [decodedTicket, setDecodedTicket] =
    useState<TicketDecodedDisplaySeed | null>(null);
  const [resolvedTicket, setResolvedTicket] =
    useState<ResolvedScanTicketDisplay | null>(null);
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [masterLoading, setMasterLoading] = useState(true);
  const [masterError, setMasterError] = useState<string | null>(null);
  const [ticketMaster, setTicketMaster] = useState<ScanTicketMaster | null>(
    null,
  );
  const [scanFrameSize, setScanFrameSize] = useState(0);
  const [shouldRenderResultCard, setShouldRenderResultCard] = useState(false);
  const [isResultCardExiting, setIsResultCardExiting] = useState(false);

  const calculateScanSize = useCallback(
    (width: number, height: number): number => Math.min(width, height) * 0.9,
    [],
  );

  useEffect(() => {
    let mounted = true;

    const preload = async () => {
      setMasterLoading(true);
      setMasterError(null);
      try {
        const master = await preloadScanTicketMaster();
        if (!mounted) {
          return;
        }
        setTicketMaster(master);
      } catch {
        if (!mounted) {
          return;
        }
        setMasterError(
          '公演マスタの取得に失敗しました。公演情報は表示できない場合があります。',
        );
      } finally {
        if (mounted) {
          setMasterLoading(false);
        }
      }
    };

    void preload();

    return () => {
      mounted = false;
    };
  }, []);

  const hasResultContent = Boolean(
    decodedTicket || decodeError || lastRawValue,
  );

  useEffect(() => {
    let timeoutId: number | null = null;

    if (hasResultContent) {
      setShouldRenderResultCard(true);
      setIsResultCardExiting(false);
      return () => {
        // noop
      };
    }

    if (!shouldRenderResultCard) {
      return () => {
        // noop
      };
    }

    setIsResultCardExiting(true);
    timeoutId = window.setTimeout(() => {
      setShouldRenderResultCard(false);
      setIsResultCardExiting(false);
    }, 1000);

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [hasResultContent, shouldRenderResultCard]);

  const handleDecode = useCallback(
    async (result: QrScanner.ScanResult) => {
      if (isProcessingRef.current) {
        return;
      }

      isProcessingRef.current = true;
      const scannedValue = result.data.trim();
      setLastRawValue(scannedValue);
      setDecodeError(null);
      setDecodedTicket(null);
      setResolvedTicket(null);

      const scanner = scannerRef.current;

      if (scanner) {
        await scanner.pause();
      }

      try {
        const [code, signature] = scannedValue.split('.');
        if (!code || !signature) {
          setDecodeError(
            'QRコードは読めましたが、チケットコードとしては不正な形式です。',
          );
          return;
        }
        const { decoded, signatureIsValid } = await decodeAndVerifyTicket(
          code,
          signature,
        );

        if (!decoded) {
          setDecodeError(
            'デコードに失敗しました。チケットコードが正しいか確認してください。',
          );
          return;
        }

        if (!signatureIsValid) {
          setDecodeError(
            'チケットコードの署名が無効です。正規のコードをスキャンしてください。',
          );
          return;
        }

        setDecodedTicket(decoded);

        let master = ticketMaster;
        if (!master) {
          try {
            master = await preloadScanTicketMaster();
            setTicketMaster(master);
          } catch {
            master = null;
          }
        }

        if (master) {
          setResolvedTicket(resolveScanTicketDisplay(decoded, master));
        }
      } catch {
        setDecodeError(
          'QRコードは読めましたが、チケットコードの検証に失敗しました。',
        );
      } finally {
        isProcessingRef.current = false;
      }
    },
    [ticketMaster],
  );

  const handleReScan = useCallback(async () => {
    setDecodeError(null);
    setDecodedTicket(null);
    setResolvedTicket(null);
    setLastRawValue('');
    setCameraError(null);

    const scanner = scannerRef.current;
    if (!scanner) {
      return;
    }

    try {
      await scanner.start();
    } catch {
      setCameraError(
        'カメラを起動できませんでした。権限設定をご確認ください。',
      );
    }
  }, []);

  useEffect(() => {
    const wrapper = videoWrapperRef.current;
    if (!wrapper) {
      return;
    }

    const update = () => {
      const width = wrapper.clientWidth;
      const height = wrapper.clientHeight;
      setScanFrameSize(calculateScanSize(width, height));
    };

    update();
    const observer = new ResizeObserver(() => {
      update();
    });
    observer.observe(wrapper);

    return () => {
      observer.disconnect();
    };
  }, [calculateScanSize]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    const scanner = new QrScanner(
      video,
      (result) => {
        void handleDecode(result);
        setTimeout(() => {
          handleReScan();
        }, TIMEOUT_RESCAN);
      },
      {
        highlightScanRegion: false,
        highlightCodeOutline: true,
        returnDetailedScanResult: true,
        calculateScanRegion: (videoEl) => {
          const videoWidth = videoEl.videoWidth || videoEl.clientWidth || 0;
          const videoHeight = videoEl.videoHeight || videoEl.clientHeight || 0;
          const clientWidth = videoEl.clientWidth || 0;
          const clientHeight = videoEl.clientHeight || 0;
          const scanSize = calculateScanSize(clientWidth, clientHeight);

          return {
            x: (videoWidth - scanSize) / 2,
            y: (videoHeight - scanSize) / 2,
            width: scanSize,
            height: scanSize,
            downScaledWidth: Math.floor(scanSize),
            downScaledHeight: Math.floor(scanSize),
          };
        },
        onDecodeError: (error) => {
          if (String(error) === QrScanner.NO_QR_CODE_FOUND) {
            return;
          }
          setDecodeError(String(error));
        },
        preferredCamera: 'environment',
      },
    );

    scannerRef.current = scanner;
    // qr-scanner内部で高頻度にgetImageDataを行うため、先に同一canvasの2D contextを
    // willReadFrequently付きで初期化してChromeのパフォーマンス警告を抑える。
    scanner.$canvas.getContext('2d', {
      alpha: false,
      willReadFrequently: true,
    });

    void scanner
      .start()
      .then(() => {
        setIsCameraReady(true);
        setCameraError(null);
      })
      .catch(() => {
        setIsCameraReady(false);
        setCameraError(
          'カメラを起動できませんでした。権限設定をご確認ください。',
        );
      });

    return () => {
      scanner.destroy();
      scannerRef.current = null;
    };
  }, [calculateScanSize, handleDecode]);

  return (
    <div>
      <div ref={videoWrapperRef} className={styles.videoWrapper}>
        <video ref={videoRef} className={styles.video} playsInline muted />
        <div className={styles.scanOverlay} aria-hidden='true'>
          <div
            className={styles.scanFrame}
            style={{
              width: `${scanFrameSize}px`,
              height: `${scanFrameSize}px`,
            }}
          />
        </div>
      </div>

      {!isCameraReady && !cameraError && (
        <Alert type='info' className={styles.statusText}>
          カメラを初期化しています...
        </Alert>
      )}
      {cameraError && (
        <Alert type='error' className={styles.errorText}>
          {cameraError}
        </Alert>
      )}
      {masterLoading && (
        <Alert type='info' className={styles.statusText}>
          公演マスタを準備しています...
        </Alert>
      )}
      {masterError && (
        <Alert type='error' className={styles.errorText}>
          {masterError}
        </Alert>
      )}

      {shouldRenderResultCard && decodedTicket && (
        <section
          className={`${styles.resultCard} ${
            isResultCardExiting ? styles.resultCardExit : styles.resultCardEnter
          }`}
        >
          <h2 className={styles.resultTitle}>
            <FaCircleCheck />
            読み取り成功
          </h2>
          <div className={styles.resultBody}>
            <p className={styles.primaryPerformance}>
              {resolvedTicket?.performanceName ?? '公演情報を解決中...'}
              <span className={styles.scheduleName}>
                {resolvedTicket?.scheduleName || '回情報なし'}
              </span>
            </p>

            <div className={styles.secondaryRow}>
              <span className={styles.secondaryItem}>
                券種: {resolvedTicket?.ticketTypeLabel ?? '-'}
              </span>
              <span className={styles.secondaryItem}>
                間柄: {resolvedTicket?.relationshipName ?? '-'}
              </span>
              <span className={styles.secondaryItem}>
                所属: {decodedTicket.affiliation}
              </span>
            </div>

            <div className={styles.tertiaryBlock}>
              {resolvedTicket?.performanceTitle && (
                <p className={styles.tertiaryLine}>
                  演目: {resolvedTicket.performanceTitle}
                </p>
              )}
              {resolvedTicket &&
                (resolvedTicket.scheduleDate ||
                  resolvedTicket.scheduleTime ||
                  resolvedTicket.scheduleEndTime) && (
                  <p className={styles.tertiaryLine}>
                    日時: {resolvedTicket.scheduleDate}
                    {resolvedTicket.scheduleTime &&
                    resolvedTicket.scheduleEndTime
                      ? ` ${resolvedTicket.scheduleTime} - ${resolvedTicket.scheduleEndTime}`
                      : ''}
                  </p>
                )}
              {lastRawValue && (
                <>
                  <p className={styles.rawValue}>
                    チケットコード: {lastRawValue.split('.')[0]}
                  </p>
                  <p className={styles.rawValue}>
                    読み取り時刻: {new Date().toLocaleString()}
                  </p>
                  <p className={styles.rawValue}>Raw: {lastRawValue}</p>
                </>
              )}
              <div className={styles.instructionBlock}>
                <p>ようこそ!係員の指示に従ってご入場ください。</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {shouldRenderResultCard && decodeError && (
        <section
          className={`${styles.resultCard} ${
            isResultCardExiting ? styles.resultCardExit : styles.resultCardEnter
          } ${styles.resultCardError}`}
        >
          <h2 className={styles.resultTitle}>
            <FaCircleXmark />
            読み取り失敗
          </h2>
          <Alert type='error' className={styles.errorText}>
            {decodeError}
          </Alert>
          <div className={styles.tertiaryBlock}>
            <p className={styles.rawValue}>Raw: {lastRawValue}</p>
          </div>
        </section>
      )}
    </div>
  );
};

export default Scan;
