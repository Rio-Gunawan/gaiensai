import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { MdArrowBack } from 'react-icons/md';
import { navigate } from 'wouter-preact/use-browser-location';

import { Link } from 'wouter-preact';
import IssueStepDetails from '../../../features/issue/IssueStepDetails';
import IssueStepPerformance from '../../../features/issue/IssueStepPerformance';
import IssueStepTicketType from '../../../features/issue/IssueStepTicketType';
import { ISSUE_RESULT_STORAGE_KEY } from '../../../features/issue/issueResultStorage';
import { supabase } from '../../../lib/supabase';
import type {
  RelationshipRow,
  SelectedPerformance,
  Step,
  TicketTypeOption,
} from '../../../types/Issue.types';
import styles from './Issue.module.css';

const TICKET_TYPE_OPTIONS: TicketTypeOption[] = [
  { id: 1, label: 'クラス公演(当日)', disabled: false },
  { id: 2, label: 'クラス公演(リハーサル)', disabled: true },
  { id: 3, label: '部活公演', disabled: true },
  { id: 4, label: '入場専用券', disabled: false },
];

const MAX_ISSUE_COUNT = 5;
const PANEL_ANIMATION_MS = 360;

const Issue = () => {
  const [step, setStep] = useState<Step>(1);
  const [selectedTicketTypeId, setSelectedTicketTypeId] = useState<number>(1);
  const [selectedPerformance, setSelectedPerformance] =
    useState<SelectedPerformance>(null);
  const [relationships, setRelationships] = useState<RelationshipRow[]>([]);
  const [relationshipLoading, setRelationshipLoading] = useState(true);
  const [relationshipError, setRelationshipError] = useState<string | null>(
    null,
  );
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<
    number | null
  >(null);
  const [issueCount, setIssueCount] = useState(1);
  const [isIssuing, setIsIssuing] = useState(false);
  const [leavingStep, setLeavingStep] = useState<Step | null>(null);
  const [isForward, setIsForward] = useState(true);
  const animationTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const loadRelationships = async () => {
      setRelationshipLoading(true);

      const { data, error } = await supabase
        .from('relationships')
        .select('id, name')
        .eq('is_accepting', true)
        .order('id', { ascending: true });

      if (error) {
        setRelationshipError('間柄の読み込みに失敗しました。');
        setRelationshipLoading(false);
        return;
      }

      setRelationships((data ?? []) as RelationshipRow[]);
      setRelationshipLoading(false);
    };

    void loadRelationships();
  }, []);

  useEffect(
    () => () => {
      if (animationTimerRef.current !== null) {
        window.clearTimeout(animationTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const loadSelectionFromQuery = async () => {
      const params = new URLSearchParams(window.location.search);
      const performanceId = Number(params.get('performanceId'));
      const scheduleId = Number(params.get('scheduleId'));

      if (
        !Number.isInteger(performanceId) ||
        !Number.isInteger(scheduleId) ||
        performanceId <= 0 ||
        scheduleId <= 0
      ) {
        return;
      }

      const [
        { data: performanceData, error: performanceError },
        { data: scheduleData, error: scheduleError },
        { data: remainingData, error: remainingError },
      ] = await Promise.all([
        supabase
          .from('class_performances')
          .select('id, class_name')
          .eq('id', performanceId)
          .maybeSingle(),
        supabase
          .from('performances_schedule')
          .select('id, round_name')
          .eq('id', scheduleId)
          .maybeSingle(),
        supabase.rpc('get_remaining_seats', {
          p_performance_id: performanceId,
          p_schedule_id: scheduleId,
        }),
      ]);

      if (performanceError || scheduleError || remainingError) {
        return;
      }

      if (!performanceData || !scheduleData) {
        return;
      }

      const remaining = Number(
        (remainingData as { remaining_general: number | string }[] | null)?.[0]
          ?.remaining_general ?? 0,
      );

      if (remaining <= 0) {
        return;
      }

      setSelectedPerformance({
        performanceId: performanceData.id,
        performanceName: performanceData.class_name,
        scheduleId: scheduleData.id,
        scheduleName: scheduleData.round_name,
        remaining,
      });
      setStep(3);
    };

    void loadSelectionFromQuery();
  }, []);

  const selectedTicketType = useMemo(
    () =>
      TICKET_TYPE_OPTIONS.find(
        (ticketType) => ticketType.id === selectedTicketTypeId,
      ) ?? null,
    [selectedTicketTypeId],
  );

  const selectedCellKey = selectedPerformance
    ? `${selectedPerformance.performanceId}-${selectedPerformance.scheduleId}`
    : undefined;
  const selectedRelationshipName =
    selectedRelationshipId === null
      ? null
      : (relationships.find(
          (relationship) => relationship.id === selectedRelationshipId,
        )?.name ?? `間柄${selectedRelationshipId}`);

  const canSubmit =
    Boolean(selectedTicketType) &&
    Boolean(selectedPerformance) &&
    selectedRelationshipId !== null &&
    issueCount > 0;

  const transitionToStep = (nextStep: Step) => {
    if (nextStep === step) {
      return;
    }

    if (animationTimerRef.current !== null) {
      window.clearTimeout(animationTimerRef.current);
    }

    const movingForward = nextStep > step;
    setIsForward(movingForward);
    setLeavingStep(step);
    setStep(nextStep);

    if (movingForward) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }

    animationTimerRef.current = window.setTimeout(() => {
      setLeavingStep(null);
      animationTimerRef.current = null;
    }, PANEL_ANIMATION_MS);
  };

  const getPanelClassName = (panelStep: Step) => {
    if (panelStep === step) {
      if (leavingStep === null) {
        return `${styles.stepPanel} ${styles.panelVisible}`;
      }

      return `${styles.stepPanel} ${styles.panelVisible} ${
        isForward ? styles.panelEnterFromRight : styles.panelEnterFromLeft
      }`;
    }

    if (panelStep === leavingStep) {
      return `${styles.stepPanel} ${styles.panelLeaving} ${
        isForward ? styles.panelExitToLeft : styles.panelExitToRight
      }`;
    }

    return `${styles.stepPanel} ${styles.panelHidden}`;
  };

  const handleIssue = async () => {
    if (!canSubmit || !selectedPerformance || !selectedTicketType) {
      return;
    }

    setIsIssuing(true);

    const { data: performanceTitle } = await supabase
      .from('class_performances')
      .select('title')
      .eq('id', selectedPerformance.performanceId)
      .maybeSingle();

    const { data, error } = await supabase.functions.invoke('issue-tickets', {
      body: {
        ticketTypeId: selectedTicketType.id,
        relationshipId: selectedRelationshipId,
        performanceId: selectedPerformance.performanceId,
        scheduleId: selectedPerformance.scheduleId,
        issueCount,
      },
    });

    if (error) {
      alert(`発券に失敗しました: ${error.message}`);
      setIsIssuing(false);
      return;
    }

    const issuedTickets = (
      data as {
        issuedTickets?: Array<{ code: string; signature: string }>;
      } | null
    )?.issuedTickets;

    if (!issuedTickets || issuedTickets.length === 0) {
      alert('発券結果を取得できませんでした。');
      setIsIssuing(false);
      return;
    }

    window.sessionStorage.setItem(
      ISSUE_RESULT_STORAGE_KEY,
      JSON.stringify({
        performanceName: selectedPerformance.performanceName,
        performanceTitle: performanceTitle?.title,
        scheduleName: selectedPerformance.scheduleName,
        ticketTypeLabel: selectedTicketType.label,
        relationshipName: selectedRelationshipName ?? '-',
        issuedTickets,
      }),
    );
    setIssueCount(1);
    setSelectedRelationshipId(null);
    setIsIssuing(false);
    navigate('/students/issue/result');
  };

  return (
    <div className={styles.issuePage}>
      <div className={styles.topActions}>
        <Link to='/students/dashboard' className={styles.topBackButton}>
          <MdArrowBack />
          戻る
        </Link>
      </div>{' '}
      <h1 className={styles.pageTitle}>チケット発券</h1>
      <div className={styles.sliderViewport}>
        <div className={getPanelClassName(1)}>
          <IssueStepTicketType
            options={TICKET_TYPE_OPTIONS}
            selectedTicketTypeId={selectedTicketTypeId}
            onSelectTicketType={setSelectedTicketTypeId}
          />
        </div>

        <div className={getPanelClassName(2)}>
          <IssueStepPerformance
            selectedPerformance={selectedPerformance}
            selectedCellKey={selectedCellKey}
            onSelectPerformance={setSelectedPerformance}
          />
        </div>

        <div className={getPanelClassName(3)}>
          <IssueStepDetails
            relationships={relationships}
            relationshipLoading={relationshipLoading}
            relationshipError={relationshipError}
            selectedRelationshipId={selectedRelationshipId}
            issueCount={issueCount}
            maxIssueCount={MAX_ISSUE_COUNT}
            selectedTicketType={selectedTicketType}
            selectedPerformance={selectedPerformance}
            onSelectRelationshipId={setSelectedRelationshipId}
            onSelectIssueCount={setIssueCount}
          />
        </div>
        <div className={styles.actions}>
          <div className={styles.progressSection}>
            <progress
              className={styles.progressBar}
              max={3}
              value={step}
            ></progress>
            <p className={styles.stepIndicator}>STEP {step} / 3</p>
          </div>
          <button
            type='button'
            className={styles.backButton}
            onClick={() => {
              if (step > 1) {
                transitionToStep((step - 1) as Step);
              }
            }}
            style={step === 1 ? { visibility: 'hidden' } : undefined}
          >
            戻る
          </button>
          <div>
            <button
              type='button'
              className={styles.nextButton}
              onClick={() => {
                if (step < 3) {
                  transitionToStep((step + 1) as Step);
                }
              }}
              disabled={
                !(step === 1 && selectedTicketType) &&
                !(step === 2 && selectedPerformance)
              }
              style={step === 3 ? { display: 'none' } : undefined}
            >
              次へ
            </button>
            <button
              type='button'
              className={styles.generateButton}
              onClick={handleIssue}
              disabled={!canSubmit || isIssuing}
              style={step !== 3 ? { display: 'none' } : undefined}
            >
              {isIssuing ? '発券中...' : '発券する'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Issue;
