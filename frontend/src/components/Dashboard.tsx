import React, { useCallback, useState, useEffect } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const COLOR_PALETTE = ['#EAB308', '#22C55E', '#F59E0B', '#16A34A', '#D97706', '#15803D'];

interface Project {
  id: string;
  name: string;
  total_investment: number;
}

interface ProjectsResponse {
  projects: Project[];
  total_budget: number;
  remaining_budget: number;
  venue_id?: string;
  venue_name?: string;
}

interface ChartDatum {
  id: string;
  name: string;
  value: number;
}

interface DashboardProps {
  venueId: string;
  isPresentationMode?: boolean;
  onPresentationModeChange?: (mode: boolean) => void;
}

function Dashboard({ venueId, isPresentationMode = false, onPresentationModeChange }: DashboardProps) {
  // State management
  const [chartData, setChartData] = useState<ChartDatum[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalInvested, setTotalInvested] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [venueName, setVenueName] = useState('');
  
  // Presentation mode states
  const [revealedCount, setRevealedCount] = useState(0);
  const [isAutoReveal, setIsAutoReveal] = useState(false);
  const [sortedProjects, setSortedProjects] = useState<Array<Project & { rank: number }>>([])

  const fetchProjects = useCallback(async (): Promise<void> => {
    try {
      const response = await axios.get<ProjectsResponse>(`${API_BASE_URL}/api/projects`, {
        params: {
          venue_id: venueId
        }
      });
      const projectList = response.data.projects;
      setVenueName(response.data.venue_name || venueId);
      
      setProjects(projectList);

      // Transform data for Recharts
      const data = projectList.map((project) => ({
        name: project.name,
        value: project.total_investment,
        id: project.id
      }));

      setChartData(data);

      // Calculate total invested amount
      const total = projectList.reduce((sum, proj) => sum + proj.total_investment, 0);
      setTotalInvested(total);

      // Sort projects by investment amount (ascending).
      // Lowest investment should be revealed first as the "last place".
      const sorted = [...projectList]
        .sort((a, b) => a.total_investment - b.total_investment)
        .map((proj, idx) => ({ ...proj, rank: projectList.length - idx }));
      setSortedProjects(sorted);

      setLastUpdated(new Date());
      setError(null);
      setLoading(false);
    } catch (err: unknown) {
      const message = axios.isAxiosError(err) ? err.message : '未知錯誤';
      setError('無法連接到伺服器: ' + message);
      console.error('Error fetching projects:', err);
      setLoading(false);
    }
  }, [venueId]);

  // Fetch projects from API every 2 seconds for polling
  useEffect(() => {
    fetchProjects();

    const intervalId = setInterval(() => {
      fetchProjects();
    }, 2000);

    return () => clearInterval(intervalId);
  }, [fetchProjects]);

  // Auto-reveal ranking items
  useEffect(() => {
    if (!isAutoReveal || revealedCount >= sortedProjects.length) {
      return;
    }

    const timer = setTimeout(() => {
      setRevealedCount((prev) => prev + 1);
    }, 1200); // 1.2 seconds between reveals

    return () => clearTimeout(timer);
  }, [isAutoReveal, revealedCount, sortedProjects.length]);

  // Keep reveal state stable during polling; only clamp when project count changes.
  useEffect(() => {
    setRevealedCount((prev) => Math.min(prev, sortedProjects.length));
  }, [sortedProjects.length]);

  // Reset reveal flow only when entering presentation mode.
  useEffect(() => {
    if (isPresentationMode) {
      setRevealedCount(0);
      setIsAutoReveal(false);
    }
  }, [isPresentationMode]);

  const getColor = (index: number): string => {
    return COLOR_PALETTE[index % COLOR_PALETTE.length];
  };

  // Custom tooltip for better UX
  const CustomTooltip = ({
    active,
    payload
  }: {
    active?: boolean;
    payload?: Array<{ payload: ChartDatum; value: number }>;
  }) => {
    if (active && payload && payload.length) {
      return (
        <div className="custom-tooltip">
          <p className="tooltip-name">{payload[0].payload.name}</p>
          <p className="tooltip-value">投資金額: ${payload[0].value.toLocaleString()}</p>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="dashboard container">
        <section className="section">
          <h2>現場大螢幕儀表板</h2>
          <p>正在同步 {venueName || venueId} 最新投資數據...</p>
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard container">
        <section className="section">
          <h2>現場大螢幕儀表板</h2>
          <div className="error-message">{error}</div>
          <p>系統正在嘗試重新連接...</p>
        </section>
      </div>
    );
  }

  if (isPresentationMode) {
    return (
      <div className="dashboard-presentation">
        <div className="presentation-header">
          <h1>{venueName || venueId} - 成果發表戰況</h1>
          <button 
            className="presentation-exit-btn"
            onClick={() => onPresentationModeChange?.(false)}
            title="按 ESC 或點擊此按鈕退出"
          >
            ✕ 退出演示
          </button>
        </div>

        <div className="presentation-ranking">
          <div className="ranking-controls">
            <button 
              className="ranking-btn"
              onClick={() => setRevealedCount(sortedProjects.length)}
            >
              📊 一次公布所有結果
            </button>
            <button 
              className={`ranking-btn ${isAutoReveal ? 'active' : ''}`}
              onClick={() => setIsAutoReveal(!isAutoReveal)}
            >
              {isAutoReveal ? '⏸ 暫停' : '▶ 逐個揭曉排名'}
            </button>
            {revealedCount < sortedProjects.length && !isAutoReveal && (
              <button 
                className="ranking-btn next-btn"
                onClick={() => setRevealedCount((prev) => Math.min(prev + 1, sortedProjects.length))}
              >
                ⏭ 下一個
              </button>
            )}
          </div>

          <div className="ranking-list">
            {sortedProjects.map((project, idx) => (
              <div
                key={project.id}
                className={`ranking-item ${idx < revealedCount ? 'revealed' : ''}`}
                style={{
                    animationDelay: `${idx < revealedCount ? idx * 0.08 : 0}s`
                }}
              >
                <div className="ranking-rank">
                  第 {project.rank} 名
                </div>
                <div className="ranking-name">
                  {project.name}
                </div>
                <div className="ranking-amount">
                  {idx < revealedCount ? `$${project.total_investment.toLocaleString()}` : '？？？'}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="presentation-footer">
          <div className="footer-stat">
            <span className="footer-label">總投資金額</span>
            <span className="footer-value">${totalInvested.toLocaleString()}</span>
          </div>
          <div className="footer-stat">
            <span className="footer-label">已投資專題</span>
            <span className="footer-value">{projects.filter((p) => p.total_investment > 0).length} / {projects.length}</span>
          </div>
          <div className="footer-stat">
            <span className="footer-label">最後更新</span>
            <span className="footer-value">{lastUpdated.toLocaleTimeString('zh-Hant-TW')}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard container">
      <section className="section dashboard-header">
        <h2>{venueName || venueId} - 成果發表戰況</h2>
        <p>最終送出後排名即時更新，準備迎接開獎時刻</p>
        <button 
          className="submit-button"
          onClick={() => onPresentationModeChange?.(true)}
          style={{ marginTop: 12 }}
        >
          🎬 全屏投影演示
        </button>
      </section>

      <section className="section dashboard-stats">
        <div className="stat-card">
          <h3>總投資金額</h3>
          <div className="stat-value">${totalInvested.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <h3>已投資專題</h3>
          <div className="stat-value">{projects.filter((p) => p.total_investment > 0).length} / {projects.length}</div>
        </div>
        <div className="stat-card">
          <h3>最後更新</h3>
          <div className="stat-value">{lastUpdated.toLocaleTimeString('zh-Hant-TW')}</div>
        </div>
      </section>

      <section className="section dashboard-chart">
        <h3>目前資金比較圖</h3>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis 
              dataKey="name" 
              angle={-45}
              textAnchor="end"
              height={100}
              tick={{ fontSize: 12 }}
            />
            <YAxis 
              label={{ value: '投資金額 (元)', angle: -90, position: 'insideLeft' }}
              tick={{ fontSize: 12 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar 
              dataKey="value" 
              radius={[8, 8, 0, 0]}
              animationDuration={300}
              isAnimationActive={true}
            >
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={getColor(index)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="chart-note">戰況每 2 秒更新一次，主持人可直接投影開獎揭曉</p>
      </section>

      <section className="section dashboard-details">
        <h3>詳細投資分配清單</h3>
        <table className="details-table">
          <thead>
            <tr>
              <th>專題名稱</th>
              <th>投資金額</th>
              <th>進度條</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project, index) => (
              <tr key={project.id}>
                <td>
                  <span 
                    className="color-indicator"
                    style={{ backgroundColor: getColor(index) }}
                  ></span>
                  {project.name}
                </td>
                <td className="amount">${project.total_investment.toLocaleString()}</td>
                <td>
                  <div className="progress-bar-container">
                    <div 
                      className="progress-bar-fill"
                      style={{ 
                        width: `${(project.total_investment / Math.max(...projects.map((p) => p.total_investment), 1)) * 100}%`,
                        backgroundColor: getColor(index)
                      }}
                    ></div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default Dashboard;
