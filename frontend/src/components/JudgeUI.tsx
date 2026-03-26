import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

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
      const message = axios.isAxiosError(err) ? err.message : '未知錯誤';
      setError('無法載入專題列表: ' + message);
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

      setSubmitMessage(lockSubmission ? '投資已上傳並鎖定。' : '投資已暫存，可繼續調整。');
      setError(null);
      await onSubmitted();
    } catch (err: unknown) {
      const errorMsg = axios.isAxiosError(err)
        ? (err.response?.data?.detail as string | undefined) || err.message
        : '未知錯誤';
      setError('提交投資失敗: ' + errorMsg);
      setSubmitMessage(null);
      console.error('Error submitting investment:', err);
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
      setSubmitMode(null);
    }
  }, [authToken, investments, isDraftValid, isFormValid, isLocked, isSubmitting, onSubmitted]);

  if (loading) {
    return <div className="container"><p>正在載入專題列表...</p></div>;
  }

  return (
    <div className="judge-ui container">
      {isSubmitting && (
        <div className="judge-upload-backdrop" role="status" aria-live="polite" aria-label="正在上傳投資資料">
          <div className="judge-upload-modal">
            <span className="judge-upload-spinner" aria-hidden="true" />
            <h3>{submitMode === 'lock' ? '正在鎖定上傳' : '正在暫存上傳'}</h3>
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
        <p>可先暫存上傳（不需花滿 10,000），確認後再鎖定上傳。</p>
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
            <div key={project.id} className="investment-item">
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
          {!isLocked && (getTotalInvested() > TOTAL_BUDGET || getRemainingBudget() > 0 || (!isFormValid() && getTotalInvested() <= TOTAL_BUDGET)) && (
            <div className="validation-message" style={{ marginBottom: 12 }}>
              {getTotalInvested() > TOTAL_BUDGET ? (
                <p>❌ 預算超出上限：超過 <strong>${(getTotalInvested() - TOTAL_BUDGET).toLocaleString()}</strong> 元</p>
              ) : null}
              {getRemainingBudget() > 0 ? (
                <p>ℹ️ 目前尚有 <strong>${getRemainingBudget().toLocaleString()}</strong> 元未分配，可先暫存。</p>
              ) : null}
              {!isFormValid() && getTotalInvested() <= TOTAL_BUDGET ? (
                <p>ℹ️ 若要鎖定上傳，需滿 10,000 元（可集中投資單一專題）。</p>
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
              {isSubmitting ? '上傳中...' : '上傳暫存'}
            </button>
            <button
              type="button"
              className="judge-action-button lock"
              onClick={() => handleSubmit(true)}
              disabled={!isFormValid() || isSubmitting || isLocked}
              title={!isFormValid() && !isLocked ? '請先完成投資分配再鎖定' : ''}
            >
              {isLocked ? '已上傳並鎖定' : isSubmitting ? '上傳中...' : '上傳鎖定'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default JudgeUI;
