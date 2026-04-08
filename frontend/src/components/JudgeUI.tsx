import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:9000';

interface Project {
  id: string;
  name: string;
  total_investment: number;
}

interface ProjectsResponse {
  projects: Project[];
  total_budget: number;
  remaining_budget: number;
}

interface MyInvestmentResponse {
  venue_id?: string | null;
  investments: Record<string, number>;
  is_voted: boolean;
}

type InvestmentMap = Record<string, number>;
type SubmitMode = 'draft' | 'lock' | null;

interface AuthUser {
  user_id: string;
  role: 'super_admin' | 'admin' | 'judge';
  display_name: string;
  venue_id?: string | null;
  phone?: string | null;
}

interface JudgeUIProps {
  authToken: string;
  authUser: AuthUser;
  venueId: string;
  venueName?: string;
  isLocked: boolean;
  onLeaveVenue: () => Promise<void>;
  onSubmitted: () => Promise<void>;
}

function JudgeUI({ authToken, authUser, venueId, venueName, isLocked, onLeaveVenue, onSubmitted }: JudgeUIProps) {
  const TOTAL_BUDGET = 10000;
  const sliderTicks = Array.from({ length: TOTAL_BUDGET / 500 + 1 }, (_, index) => index * 500);
  
  // State management
  const [projects, setProjects] = useState<Project[]>([]);
  const [investments, setInvestments] = useState<InvestmentMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMode, setSubmitMode] = useState<SubmitMode>(null);
  const [isLockConfirmOpen, setIsLockConfirmOpen] = useState(false);
  const submittingRef = useRef(false);

  // Fetch projects on component mount
  const fetchProjects = useCallback(async (showLoader = false): Promise<void> => {
    try {
      if (showLoader) {
        setLoading(true);
      }
      const response = await axios.get<ProjectsResponse>(`${API_BASE_URL}/api/projects`, {
        params: { venue_id: venueId },
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });
      const projectList = response.data.projects;
      
      setProjects(projectList);

      // Build defaults first, then merge server-side saved allocations if available.
      const initialInvestments: InvestmentMap = {};
      projectList.forEach((project) => {
        initialInvestments[project.id] = 0;
      });

      try {
        const myInvestmentResp = await axios.get<MyInvestmentResponse>(`${API_BASE_URL}/api/judges/my-investment`, {
          headers: {
            Authorization: `Bearer ${authToken}`
          }
        });

        const saved = myInvestmentResp.data.investments || {};
        projectList.forEach((project) => {
          if (typeof saved[project.id] === 'number') {
            initialInvestments[project.id] = saved[project.id];
          }
        });
      } catch (savedErr) {
        // Keep default 0 allocations if the endpoint is temporarily unavailable.
        console.warn('Unable to load saved judge investments:', savedErr);
      }

      setInvestments(initialInvestments);
      setError(null);
    } catch (err: unknown) {
      setError('無法載入專題列表。發生錯誤，請聯絡系統管理員');
      console.error('Error fetching projects:', err);
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }, [authToken, venueId]);

  useEffect(() => {
    fetchProjects(true);
  }, [fetchProjects]);

  // Calculate budget statistics
  const getTotalInvested = () => {
    return Object.values(investments).reduce((a, b) => a + b, 0);
  };

  const getRemainingBudget = () => {
    return TOTAL_BUDGET - getTotalInvested();
  };

  const isDraftValid = useCallback(() => {
    if (projects.length === 0) {
      return false;
    }
    const totalInvested = Object.values(investments).reduce((a, b) => a + b, 0);
    return totalInvested <= TOTAL_BUDGET;
  }, [investments, projects, TOTAL_BUDGET]);

  // Check if form is valid
  const isFormValid = useCallback(() => {
    if (projects.length === 0) {
      return false;
    }

    const totalInvested = Object.values(investments).reduce((a, b) => a + b, 0);
    return totalInvested === TOTAL_BUDGET;
  }, [investments, projects, TOTAL_BUDGET]);

  // Check if any project has an invalid negative investment.
  const hasNegativeInvestment = useCallback(() => {
    return Object.values(investments).some((amount) => amount < 0);
  }, [investments]);

  // Handle investment amount change
  const handleInvestmentChange = (projectId: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    setSubmitMessage(null);
    setInvestments((prev) => ({
      ...prev,
      [projectId]: numValue
    }));
  };

  // Submit investments
  const handleSubmit = useCallback(async (lockSubmission: boolean): Promise<void> => {
    if (submittingRef.current || isSubmitting) {
      return;
    }
    submittingRef.current = true;

    if (isLocked) {
      setError('本回合已上傳並鎖定，無法再修改');
      submittingRef.current = false;
      return;
    }

    if (lockSubmission && !isFormValid()) {
      setError('鎖定上傳驗證失敗。請確保總額為 10,000 元。');
      submittingRef.current = false;
      return;
    }

    if (!lockSubmission && !isDraftValid()) {
      setError('暫存上傳失敗：投資總額不可超過 10,000 元。');
      submittingRef.current = false;
      return;
    }

    // Draft save may keep some projects at 0, but negative values are never allowed.
    for (const [projectId, amount] of Object.entries(investments)) {
      if (amount < 0) {
        setError(`投資金額不可小於 0 元。專題 ${projectId} 的投資金額無效。`);
        submittingRef.current = false;
        return;
      }
    }

    const totalInvested = Object.values(investments).reduce((a, b) => a + b, 0);
    if (totalInvested <= 0) {
      setError('投資總額不可為 0 元，請至少投資一個專題。');
      submittingRef.current = false;
      return;
    }

    try {
      setSubmitMode(lockSubmission ? 'lock' : 'draft');
      setIsSubmitting(true);
      setSubmitMessage(null);
      await axios.post(`${API_BASE_URL}/api/submit_investment`, {
        investments,
        lock_submission: lockSubmission,
      }, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });

      setSubmitMessage(lockSubmission ? '最後結果已上傳並鎖定，無法再修改。' : '投資結果已上傳，可繼續調整。');
      setError(null);
      await onSubmitted();
    } catch (err: unknown) {
      setError('提交投資失敗。發生錯誤，請聯絡系統管理員');
      setSubmitMessage(null);
      console.error('Error submitting investment:', err);
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
      setSubmitMode(null);
    }
  }, [authToken, investments, isDraftValid, isFormValid, isLocked, isSubmitting, onSubmitted]);

  if (loading) {
    return (
      <div className="container judge-page-loading" role="status" aria-live="polite" aria-label="正在載入專題列表">
        <span className="judge-upload-spinner judge-page-loading-spinner" aria-hidden="true" />
        <p className="judge-upload-status judge-page-loading-text">
          正在載入專題列表
          <span className="dot dot-1" aria-hidden="true">.</span>
          <span className="dot dot-2" aria-hidden="true">.</span>
          <span className="dot dot-3" aria-hidden="true">.</span>
        </p>
      </div>
    );
  }

  return (
    <div className="judge-ui container">
      {isLockConfirmOpen && !isLocked && (
        <div className="judge-lock-confirm-backdrop" role="dialog" aria-modal="true" aria-label="確認鎖定上傳">
          <div className="judge-lock-confirm-modal">
            <h3>確認最後結果上傳？</h3>
            <p>
              送出後將立即鎖定本次評分，後續無法再修改任何投資金額。
            </p>
            <p>
              請再次確認：所有專題都已分配且總額為 <strong>10,000 元</strong>。
            </p>
            <div className="judge-lock-confirm-actions">
              <button
                type="button"
                className="judge-lock-cancel-btn"
                onClick={() => setIsLockConfirmOpen(false)}
                disabled={isSubmitting}
              >
                取消
              </button>
              <button
                type="button"
                className="judge-lock-confirm-btn"
                onClick={() => {
                  setIsLockConfirmOpen(false);
                  void handleSubmit(true);
                }}
                disabled={isSubmitting}
              >
                確認鎖定並上傳
              </button>
            </div>
          </div>
        </div>
      )}
      {isSubmitting && (
        <div className="judge-upload-backdrop" role="status" aria-live="polite" aria-label="正在上傳投資資料">
          <div className="judge-upload-modal">
            <span className="judge-upload-spinner" aria-hidden="true" />
            <h3>{submitMode === 'lock' ? '正在上傳最後結果' : '正在上傳結果'}</h3>
            <p className="judge-upload-status">
              資料傳送中，請稍候
              <span className="dot dot-1" aria-hidden="true">.</span>
              <span className="dot dot-2" aria-hidden="true">.</span>
              <span className="dot dot-3" aria-hidden="true">.</span>
            </p>
          </div>
        </div>
      )}
      <section className="section judge-header">
        <h2>評審投資介面</h2>
        <p>目前身份：<strong>{authUser.display_name}</strong>（{authUser.role}）</p>
        {authUser.venue_id ? <p>目前會場：<strong>{venueName || authUser.venue_id}</strong></p> : null}
        <p>請將固定預算 <strong>10,000 元</strong> 投資分配給各個專題</p>
        <p>每聽完一組報告後請按「上傳結果」儲存進度；所有組別聽完、確認配分無誤後，再按「最後結果上傳」鎖定。</p>
        {!isLocked && (
          <div className="nav-buttons" style={{ marginTop: 12 }}>
            <button onClick={onLeaveVenue}>離開房間重新選擇</button>
          </div>
        )}
      </section>

      {error && <div className="error-message">{error}</div>}
      {submitMessage && <div className="success-message">{submitMessage}</div>}

      <section className="section judge-form">
        {projects.map((project) => {
          const currentAmount = investments[project.id] || 0;
          const hasInvested = currentAmount > 0;
          return (
            <div key={project.id} className={`investment-item ${hasInvested ? 'invested' : 'uninvested'}`}>
              <div className="project-header">
                <label>{project.name}</label>
              </div>
              
              <div className="input-group">
                <input 
                  type="number" 
                  min="0" 
                  step="500"
                  value={currentAmount}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInvestmentChange(project.id, e.target.value)}
                  disabled={isSubmitting || isLocked}
                  className="investment-input"
                />
                <span className="currency">元</span>
              </div>

              <input 
                type="range" 
                min="0" 
                max={TOTAL_BUDGET}
                step="500"
                list={`tick-${project.id}`}
                value={currentAmount}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInvestmentChange(project.id, e.target.value)}
                disabled={isSubmitting || isLocked}
                className="investment-slider"
              />
              <datalist id={`tick-${project.id}`}>
                {sliderTicks.map((tick) => (
                  <option key={tick} value={tick} />
                ))}
              </datalist>
              <div className="investment-slider-scale" aria-hidden="true">
                {sliderTicks.map((tick, i) => (
                  <span
                    key={tick}
                    className={tick % 1000 === 0 ? 'major' : 'minor'}
                    style={{ left: `calc(9px + ${i} * (100% - 18px) / 20)` }}
                  >
                    {tick % 1000 === 0 ? tick.toLocaleString() : ''}
                  </span>
                ))}
              </div>

              {hasInvested && (
                <div className="interim-result">
                  <span className="interim-label">暫存結果：</span>
                  <span className="interim-amount">${currentAmount.toLocaleString()}</span>
                </div>
              )}
            </div>
          );
        })}

        <div className="budget-summary">
          <div className="summary-item">
            <span>已分配：</span>
            <strong>${getTotalInvested().toLocaleString()}</strong>
          </div>
          <div className="summary-item">
            <span>剩餘預算：</span>
            <strong className={getRemainingBudget() === 0 ? 'valid' : 'invalid'}>
              ${getRemainingBudget().toLocaleString()}
            </strong>
          </div>
          <div className="summary-item">
            <span>預算上限：</span>
            <strong>${TOTAL_BUDGET.toLocaleString()}</strong>
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          {!isLocked && (getTotalInvested() > TOTAL_BUDGET || getRemainingBudget() > 0 || (!isFormValid() && getTotalInvested() <= TOTAL_BUDGET) || hasNegativeInvestment()) && (
            <div className="validation-message" style={{ marginBottom: 12 }}>
              {getTotalInvested() === 0 ? (
                <p>❌ 投資總額不可為 0 元，請至少投資一個專題。</p>
              ) : null}
              {hasNegativeInvestment() ? (
                <p>❌ 投資金額不可小於 0 元，請修正後再上傳。</p>
              ) : null}
              {getTotalInvested() > TOTAL_BUDGET ? (
                <p>❌ 預算超出上限：超過 <strong>${(getTotalInvested() - TOTAL_BUDGET).toLocaleString()}</strong> 元</p>
              ) : null}
              {getRemainingBudget() > 0 ? (
                <p>ℹ️ 目前尚有 <strong>${getRemainingBudget().toLocaleString()}</strong> 元未分配，可先上傳結果；尚未分配的專題可暫時保留為 0 元。</p>
              ) : null}
              {!isFormValid() && getTotalInvested() <= TOTAL_BUDGET ? (
                <p>ℹ️ 若要上傳最後結果並鎖定，需滿 10,000 元（可集中投資單一專題）。</p>
              ) : null}
            </div>
          )}

          <div className="judge-submit-actions" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="judge-action-button draft"
              onClick={() => handleSubmit(false)}
              disabled={!isDraftValid() || isSubmitting || isLocked}
              title={!isDraftValid() && !isLocked ? '投資總額不可超過 10,000 元' : ''}
            >
              {isSubmitting ? '上傳中...' : '上傳結果'}
            </button>
            <button
              type="button"
              className="judge-action-button lock"
              onClick={() => setIsLockConfirmOpen(true)}
              disabled={!isFormValid() || isSubmitting || isLocked}
              title={!isFormValid() && !isLocked ? '請先完成投資分配再鎖定' : ''}
            >
              {isLocked ? '已上傳並鎖定' : isSubmitting ? '上傳中...' : '最後結果上傳'}
            </button>
          </div>
          <p style={{ marginTop: 10, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            ⚠️ 每聽完一組報告後，請按「<strong>上傳結果</strong>」儲存目前配分，可隨時修改；尚未決定的專題可先保留為 0 元。<br />
            所有組別聽完並確認無誤後，再按「<strong>最後結果上傳</strong>」鎖定——鎖定後將無法再更改任何結果。<br />
            <br />
            若有任何問題或不小心誤觸鎖定，請立即告知現場工作人員協助處理。
          </p>
        </div>
      </section>
    </div>
  );
}

export default JudgeUI;
