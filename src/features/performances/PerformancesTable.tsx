import { useEffect, useMemo, useState } from 'preact/hooks';
import { supabase } from '../../lib/supabase';
import styles from './PerformancesTable.module.css';
import { RiCircleLine, RiCloseLargeLine, RiTriangleLine } from 'react-icons/ri';
import { navigate } from 'wouter-preact/use-browser-location';

import type { AvailableSeatSelection } from '../../types/types';

type PerformanceRow = {
  id: number;
  class_name: string;
  total_capacity: number | null;
  junior_capacity: number | null;
};

type PerformanceSchedule = {
  id: number;
  round_name: string;
};

type RemainingSeatsRpcResult = {
  remaining_general: number | string;
  remaining_junior: number;
};

type PerformancesTableProps = {
  enableIssueJump?: boolean;
  onAvailableCellClick?: (selection: AvailableSeatSelection) => void;
  selectedCellKey?: string;
};

const PerformancesTable = ({
  enableIssueJump = false,
  onAvailableCellClick,
  selectedCellKey,
}: PerformancesTableProps) => {
  const [performances, setPerformances] = useState<PerformanceRow[]>([]);
  const [schedules, setSchedules] = useState<PerformanceSchedule[]>([]);
  const [selectedPerformanceId, setSelectedPerformanceId] = useState<
    number | 'all'
  >('all');
  const [selectedScheduleId, setSelectedScheduleId] = useState<number | 'all'>(
    'all',
  );
  const [remainingSeatMap, setRemainingSeatMap] = useState<Map<string, number>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErrorMessage(null);

      const [
        { data: performanceData, error: performanceError },
        { data: scheduleData, error: scheduleError },
      ] = await Promise.all([
        supabase
          .from('class_performances')
          .select('id, class_name, total_capacity, junior_capacity')
          .order('id', { ascending: true }),
        supabase
          .from('class_performances_schedule')
          .select('id, round_name')
          .order('id', { ascending: true }),
      ]);

      if (performanceError || scheduleError) {
        setErrorMessage('公演空き状況の取得に失敗しました。');
        setLoading(false);
        return;
      }

      const loadedPerformances = (performanceData ?? []) as PerformanceRow[];
      const loadedSchedules = (scheduleData ?? []) as PerformanceSchedule[];
      const seatMap = new Map<string, number>();

      for (const schedule of loadedSchedules) {
        const rpcCalls = loadedPerformances.map((performance) =>
          supabase.rpc('get_remaining_seats', {
            p_performance_id: performance.id,
            p_schedule_id: schedule.id,
          }),
        );

        const rpcResults = await Promise.all(rpcCalls);

        for (let i = 0; i < loadedPerformances.length; i += 1) {
          const performance = loadedPerformances[i];
          const { data, error } = rpcResults[i] as {
            data: RemainingSeatsRpcResult[] | null;
            error: unknown;
          };

          if (error) {
            setErrorMessage('残席情報の取得に失敗しました。');
            setLoading(false);
            return;
          }

          const remainingGeneral = Number(data?.[0]?.remaining_general ?? 0);
          seatMap.set(
            `${performance.id}-${schedule.id}`,
            Math.max(remainingGeneral, 0),
          );
        }
      }

      setRemainingSeatMap(seatMap);
      setPerformances(loadedPerformances);
      setSchedules(loadedSchedules);
      setLoading(false);
    };

    void load();
  }, []);

  const statusByKey = useMemo(() => {
    const map = new Map<string, 'circle' | 'triangle' | 'cross'>();

    schedules.forEach((schedule) => {
      performances.forEach((performance) => {
        const key = `${performance.id}-${schedule.id}`;
        const remaining = Number(remainingSeatMap.get(key) ?? 0);
        const totalCapacity = Number(performance.total_capacity ?? 0);
        const juniorCapacity = Number(performance.junior_capacity ?? 0);
        const generalCapacity = Math.max(totalCapacity - juniorCapacity, 0);
        const lowStockThreshold = Math.max(
          1,
          Math.ceil(generalCapacity * 0.1),
        );

        if (remaining <= 0) {
          map.set(key, 'cross');
          return;
        }

        if (generalCapacity > 0 && remaining <= lowStockThreshold) {
          map.set(key, 'triangle');
          return;
        }

        map.set(key, 'circle');
      });
    });

    return map;
  }, [performances, schedules, remainingSeatMap]);

  const filteredPerformances = useMemo(
    () =>
      performances.filter(
        (performance) =>
          selectedPerformanceId === 'all' ||
          performance.id === selectedPerformanceId,
      ),
    [performances, selectedPerformanceId],
  );

  const filteredSchedules = useMemo(
    () =>
      schedules.filter(
        (schedule) =>
          selectedScheduleId === 'all' || schedule.id === selectedScheduleId,
      ),
    [schedules, selectedScheduleId],
  );

  const getMark = (status: 'circle' | 'triangle' | 'cross') => {
    if (status === 'cross') {
      return <RiCloseLargeLine />;
    }
    if (status === 'triangle') {
      return <RiTriangleLine />;
    }
    return <RiCircleLine />;
  };

  const getStatusClass = (status: 'circle' | 'triangle' | 'cross') => {
    switch (status) {
      case 'circle':
        return styles.statusCircle;
      case 'triangle':
        return styles.statusTriangle;
      case 'cross':
        return styles.statusCross;
    }
  };

  const handleAvailableCellClick = (selection: AvailableSeatSelection): void => {
    onAvailableCellClick?.(selection);

    if (!enableIssueJump) {
      return;
    }

    const searchParams = new URLSearchParams({
      performanceId: String(selection.performanceId),
      scheduleId: String(selection.scheduleId),
    });

    navigate(`/students/issue?${searchParams.toString()}`);
  };

  if (loading) {
    return <p>読み込み中...</p>;
  }

  if (errorMessage) {
    return <p>{errorMessage}</p>;
  }

  if (performances.length === 0 || schedules.length === 0) {
    return <p>表示できる公演データがありません。</p>;
  }

  if (filteredPerformances.length === 0 || filteredSchedules.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.filters}>
          <label className={styles.filterLabel} htmlFor='class-filter'>
            クラス
            <select
              id='class-filter'
              className={styles.filterSelect}
              value={String(selectedPerformanceId)}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setSelectedPerformanceId(value === 'all' ? 'all' : Number(value));
              }}
            >
              <option value='all'>すべて</option>
              {performances.map((performance) => (
                <option key={performance.id} value={performance.id}>
                  {performance.class_name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.filterLabel} htmlFor='schedule-filter'>
            公演回
            <select
              id='schedule-filter'
              className={styles.filterSelect}
              value={String(selectedScheduleId)}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setSelectedScheduleId(value === 'all' ? 'all' : Number(value));
              }}
            >
              <option value='all'>すべて</option>
              {schedules.map((schedule) => (
                <option key={schedule.id} value={schedule.id}>
                  {schedule.round_name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className={styles.emptyState}>該当するデータがありません。</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.filters}>
        <label className={styles.filterLabel} htmlFor='class-filter'>
          クラス
          <select
            id='class-filter'
            className={styles.filterSelect}
            value={String(selectedPerformanceId)}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setSelectedPerformanceId(value === 'all' ? 'all' : Number(value));
            }}
          >
            <option value='all'>すべて</option>
            {performances.map((performance) => (
              <option key={performance.id} value={performance.id}>
                {performance.class_name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.filterLabel} htmlFor='schedule-filter'>
          公演回
          <select
            id='schedule-filter'
            className={styles.filterSelect}
            value={String(selectedScheduleId)}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setSelectedScheduleId(value === 'all' ? 'all' : Number(value));
            }}
          >
            <option value='all'>すべて</option>
            {schedules.map((schedule) => (
              <option key={schedule.id} value={schedule.id}>
                {schedule.round_name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={styles.legend}>
        <span className={`${styles.legendItem} ${styles.statusCircle}`}>○ 余裕あり</span>
        <span className={`${styles.legendItem} ${styles.statusTriangle}`}>△ 残り10%以下</span>
        <span className={`${styles.legendItem} ${styles.statusCross}`}>× 売り切れ</span>
      </div>
      <p className={styles.scrollHint}>← 横にスクロールできます →</p>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr className={styles.tr}>
              <th className={styles.th}>公演回</th>
              {filteredPerformances.map((performance) => (
                <th className={styles.th} key={performance.id}>
                  {performance.class_name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredSchedules.map((schedule) => (
              <tr key={schedule.id} className={styles.tr}>
                <th className={styles.th}>{schedule.round_name}</th>
                {filteredPerformances.map((performance) => {
                  const key = `${performance.id}-${schedule.id}`;
                  const remaining = remainingSeatMap.get(key) ?? 0;
                  const status = statusByKey.get(key) ?? 'cross';
                  const canIssue = remaining > 0;
                  const canJump = canIssue && enableIssueJump;
                  const isInteractive = canIssue && (enableIssueJump || Boolean(onAvailableCellClick));
                  const isSelected = selectedCellKey === key;

                  return (
                    <td
                      className={`${styles.td} ${getStatusClass(status)} ${
                        canJump ? styles.jumpableCell : ''
                      } ${isInteractive ? styles.interactiveCell : ''} ${
                        isSelected ? styles.selectedCell : ''
                      }`}
                      key={`${schedule.id}-${performance.id}`}
                      onClick={() => {
                        if (!canIssue) {
                          return;
                        }

                        handleAvailableCellClick({
                          performanceId: performance.id,
                          performanceName: performance.class_name,
                          scheduleId: schedule.id,
                          scheduleName: schedule.round_name,
                          remaining,
                        });
                      }}
                      onKeyDown={(event) => {
                        if (!isInteractive) {
                          return;
                        }

                        if (event.key !== 'Enter' && event.key !== ' ') {
                          return;
                        }

                        event.preventDefault();
                        handleAvailableCellClick({
                          performanceId: performance.id,
                          performanceName: performance.class_name,
                          scheduleId: schedule.id,
                          scheduleName: schedule.round_name,
                          remaining,
                        });
                      }}
                      tabIndex={isInteractive ? 0 : undefined}
                      role={isInteractive ? 'button' : undefined}
                      aria-label={
                        isInteractive
                          ? `${performance.class_name} ${schedule.round_name} 残り${remaining}席`
                          : undefined
                      }
                    >
                      <div className={styles.mark}>{getMark(status)}</div>
                      <div className={styles.remaining}>残り{remaining}席</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PerformancesTable;
