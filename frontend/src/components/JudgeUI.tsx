import React, { useState, useEffect, useCallback } from 'react';
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

interface AuthUser {
  user_id: string;
  role: 'admin' | 'judge';
  display_name: string;
  venue_id?: string | null;
  phone?: string | null;
}

interface JudgeUIProps {
  authToken: string;
  authUser: AuthUser;
  venueId: string;
  isLocked: boolean;
  onLeaveVenue: () => Promise<void>;
  onSubmitted: () => Promise<void>;
}

function JudgeUI({ authToken, authUser, venueId, isLocked, onLeaveVenue, onSubmitted }: JudgeUIProps) {
  const TOTAL_BUDGET = 10000;
  
  // State management
  const [projects, setProjects] = useState<Project[]>([]);
  const [investments, setInvestments] = useState<InvestmentMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  // Check if form is valid
  const isFormValid = useCallback(() => {
    if (projects.length === 0) {
      return false;
    }

    const totalInvested = Object.values(investments).reduce((a, b) => a + b, 0);
    const hasZeroInvestment = projects.some((project) => (investments[project.id] ?? 0) <= 0);
    return totalInvested === TOTAL_BUDGET && !hasZeroInvestment;
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
  const handleSubmit = useCallback(async (): Promise<void> => {
    if (isSubmitting) {
      return;
    }

    if (isLocked) {
      setError('本回合已上傳並鎖定，無法再修改');
      return;
    }

    if (!isFormValid()) {
      setError('投資金額驗證失敗。請確保總額為 10,000 元且每個專題都有分配。');
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitMessage(null);
      await axios.post(`${API_BASE_URL}/api/submit_investment`, {
        investments: investments
      }, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });

      setSubmitMessage('投資已上傳並鎖定。');
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
      setIsSubmitting(false);
    }
  }, [authToken, investments, isFormValid, isLocked, isSubmitting, onSubmitted]);

  if (loading) {
    return <div className="container"><p>正在載入專題列表...</p></div>;
  }

  return (
    <div className="judge-ui container">
      <section className="section judge-header">
        <h2>評審投資介面</h2>
        <p>目前身份：<strong>{authUser.display_name}</strong>（{authUser.role}）</p>
        {authUser.venue_id ? <p>目前會場：<strong>{authUser.venue_id}</strong></p> : null}
        <p>請將固定預算 <strong>10,000 元</strong> 投資分配給各個專題</p>
        <p>每個專題的投資金額必須大於等於 0 元，按下上傳後將鎖定本回合配置</p>
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
                  step="100"
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
                step="100"
                value={currentAmount}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInvestmentChange(project.id, e.target.value)}
                disabled={isSubmitting || isLocked}
                className="investment-slider"
              />

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
          {!isLocked && !isFormValid() && (
            <div className="validation-message" style={{ marginBottom: 12 }}>
              {getRemainingBudget() !== 0 ? (
                <p>❌ 預算未完全分配：還剩 <strong>${Math.abs(getRemainingBudget()).toLocaleString()}</strong> 元需要分配</p>
              ) : null}
              {projects.some((p) => (investments[p.id] ?? 0) <= 0) ? (
                <p>❌ 有專題未分配投資：每個專題都必須分配大於 0 元</p>
              ) : null}
            </div>
          )}
          <button 
            className="submit-button"
            onClick={handleSubmit}
            disabled={!isFormValid() || isSubmitting || isLocked}
            title={!isFormValid() && !isLocked ? '請先完成投資分配' : ''}
          >
            {isLocked ? '已上傳並鎖定' : isSubmitting ? '上傳中...' : '上傳並鎖定'}
          </button>
        </div>
      </section>
    </div>
  );
}

export default JudgeUI;
