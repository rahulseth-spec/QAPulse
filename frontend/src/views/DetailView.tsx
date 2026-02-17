import React, { useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { WeeklyReport, Project, User, ReportStatus, HealthStatus, LoadStatus, GoalRow, ThreadRow, ExecutionReadinessSlide } from '../types';
import { formatLocalISODate, getMonthName, parseISODateToLocal } from '../utils';

interface DetailProps {
  reports: WeeklyReport[];
  projects: Project[];
  user: User;
  users: User[];
  onUpdate: (report: WeeklyReport) => void;
  onDelete: (id: string) => void;
}

const DetailView: React.FC<DetailProps> = ({ reports, projects, user, users, onUpdate, onDelete }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const report = reports.find(r => r.id === id);

  if (!report) return <div className="text-center py-20 text-slate-400 font-bold">Report not found.</div>;

  const project = projects.find(p => p.id === report.projectId);
  const isOverall = report.scope === 'OVERALL' || (report.executionReadinessSlides?.length ?? 0) > 0 || !report.projectId;
  const headerProjectName = isOverall ? 'All Projects' : (project?.name || 'Project');
  const headerProjectCode = isOverall ? 'ALL' : (project?.code || '');
  const executionSlidesBase: ExecutionReadinessSlide[] = isOverall
    ? (report.executionReadinessSlides?.length ? report.executionReadinessSlides : [])
    : [
        {
          projectId: report.projectId || '',
          projectNameOverride: '',
          capacity: report.capacity,
          strength: report.strength,
          sprintHealth: report.sprintHealth,
          bottlenecks: report.bottlenecks,
          decisions: report.decisions,
        },
      ];
  const executionSlidesToRender: ExecutionReadinessSlide[] = executionSlidesBase.length
    ? executionSlidesBase
    : [
        {
          projectId: report.projectId || '',
          projectNameOverride: '',
          capacity: report.capacity,
          strength: report.strength,
          sprintHealth: report.sprintHealth,
          bottlenecks: report.bottlenecks,
          decisions: report.decisions,
        },
      ];
  const isOwner = report.createdBy === user.id;

  useEffect(() => {
    const state = location.state as any;
    if (state?.autoPrint) {
      window.setTimeout(() => window.print(), 0);
      navigate(`/report/${report.id}`, { replace: true, state: null });
      return;
    }
    if (state?.autoPpt) {
      window.setTimeout(() => { handleExportPPT(); }, 0);
      navigate(`/report/${report.id}`, { replace: true, state: null });
    }
  }, [location.key]);

  const pillBase = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold tracking-wide ring-1 ring-inset';

  const getHealthPill = (value: HealthStatus | 'NA') => {
    if (value === 'NA') return { label: 'N/A', ring: 'bg-slate-100 text-slate-700 ring-slate-200', dot: 'bg-slate-400' };
    if (value === HealthStatus.GREEN) return { label: 'GREEN', ring: 'bg-emerald-50 text-emerald-800 ring-emerald-200', dot: 'bg-emerald-500' };
    if (value === HealthStatus.YELLOW) return { label: 'YELLOW', ring: 'bg-amber-50 text-amber-900 ring-amber-200', dot: 'bg-amber-500' };
    return { label: 'RED', ring: 'bg-rose-50 text-rose-900 ring-rose-200', dot: 'bg-rose-500' };
  };

  const getLoadStatusPill = (value: LoadStatus) => {
    if (value === LoadStatus.NORMAL) return { label: 'NORMAL', ring: 'bg-emerald-50 text-emerald-800 ring-emerald-200', dot: 'bg-emerald-500' };
    if (value === LoadStatus.UNDERUTILIZED) return { label: 'UNDERUTILIZED', ring: 'bg-amber-50 text-amber-900 ring-amber-200', dot: 'bg-amber-500' };
    return { label: 'OVERLOADED', ring: 'bg-rose-50 text-rose-900 ring-rose-200', dot: 'bg-rose-500' };
  };

  const getThreadStatusPill = (value: string) => {
    if (value === 'COMPLETED') return { label: 'COMPLETED', ring: 'bg-emerald-50 text-emerald-800 ring-emerald-200', dot: 'bg-emerald-500' };
    if (value === 'IN_PROGRESS') return { label: 'IN PROGRESS', ring: 'bg-amber-50 text-amber-900 ring-amber-200', dot: 'bg-amber-500' };
    if (value === 'BLOCKED') return { label: 'BLOCKED', ring: 'bg-rose-50 text-rose-900 ring-rose-200', dot: 'bg-rose-500' };
    return { label: 'NOT STARTED', ring: 'bg-slate-100 text-slate-700 ring-slate-200', dot: 'bg-slate-400' };
  };

  const slugify = (s: string) =>
    (s || 'weekly_snapshot')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

  const getUserName = (userId: string) => users.find(u => u.id === userId)?.name || 'Unknown User';

  const isWeekdayISO = (isoDate: string) => {
    const day = parseISODateToLocal(isoDate).getDay();
    return day !== 0 && day !== 6;
  };

  const getWeekStartMondayISO = (isoDate: string) => {
    const date = parseISODateToLocal(isoDate);
    const day = date.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diffToMonday);
    return formatLocalISODate(date);
  };

  const addDaysISO = (isoDate: string, days: number) => {
    const date = parseISODateToLocal(isoDate);
    date.setDate(date.getDate() + days);
    return formatLocalISODate(date);
  };

  const getWeekEndFridayISO = (isoDate: string) => addDaysISO(getWeekStartMondayISO(isoDate), 4);

  const computeActiveContributorCount = (names: string) =>
    names
      .split(',')
      .map(s => s.trim())
      .filter(Boolean).length;

  const isPublishable = (r: WeeklyReport) => {
    if (!r.projectId || !r.startDate || !r.endDate) return false;
    if (!isWeekdayISO(r.startDate) || !isWeekdayISO(r.endDate)) return false;
    if (parseISODateToLocal(r.endDate) < parseISODateToLocal(r.startDate)) return false;
    if (parseISODateToLocal(r.endDate) > parseISODateToLocal(getWeekEndFridayISO(r.startDate))) return false;

    if (!Array.isArray(r.goals) || r.goals.length < 1) return false;
    if (r.goals.slice(0, 1).some(g => !g.goal.trim() || !g.successMetric.trim())) return false;
    if (
      r.goals.slice(1).some(g => {
        const any = g.goal.trim() || g.successMetric.trim();
        return any && (!g.goal.trim() || !g.successMetric.trim());
      })
    ) {
      return false;
    }

    if (!r.capacity) return false;
    if (!Number.isFinite(r.capacity.plannedHours) || r.capacity.plannedHours <= 0) return false;
    if (!Number.isFinite(r.capacity.committedHours) || r.capacity.committedHours <= 0) return false;
    if (!r.capacity.loadStatus) return false;

    if (!r.strength) return false;
    if (!r.strength.activeContributorNames?.trim()) return false;
    if (computeActiveContributorCount(r.strength.activeContributorNames) <= 0) return false;

    if (!r.sprintHealth) return false;
    if (!r.sprintHealth.startDate) return false;
    if (r.sprintHealth.goalClarity === 'NA' || !r.sprintHealth.goalClarity) return false;
    if (r.sprintHealth.readiness === 'NA' || !r.sprintHealth.readiness) return false;

    if (!Array.isArray(r.bottlenecks) || r.bottlenecks.length < 3) return false;
    if (r.bottlenecks.slice(0, 3).some(b => !b.trim())) return false;

    if (!Array.isArray(r.decisions) || r.decisions.length < 3) return false;
    if (r.decisions.slice(0, 3).some(d => !d.decisionText.trim())) return false;

    if (!Array.isArray(r.threads) || r.threads.length < 1) return false;
    if (r.threads.slice(0, 1).some(t => !t.product?.trim() || !t.thread.trim() || !t.ownerId || !t.status)) return false;
    if (
      r.threads.slice(1).some(t => {
        const any = (t.product || '').trim() || t.thread.trim() || t.ownerId || t.status;
        return any && (!t.product?.trim() || !t.thread.trim() || !t.ownerId || !t.status);
      })
    ) {
      return false;
    }

    return true;
  };

  const handlePublish = () => {
    if (!isOwner) return;
    if (!isPublishable(report)) return;
    onUpdate({ ...report, status: ReportStatus.PUBLISHED, publishedBy: user.id, updatedBy: user.id, updatedAt: new Date().toISOString() });
  };

  const handleExportPDF = async () => {
    const root = document.getElementById('printable-report');
    if (!root) {
      window.print();
      return;
    }

    const title = report.title || 'Weekly Snapshot';
    const fileName = `${slugify(title)}.pdf`;
    const html2pdf = (window as any).html2pdf;

    if (typeof html2pdf !== 'function') {
      window.print();
      return;
    }

    try {
      await (html2pdf() as any)
        .set({
          filename: fileName,
          margin: [10, 10, 10, 10],
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'] },
        })
        .from(root)
        .save();
    } catch {
      window.print();
    }
  };

  const handleExportPPT = async () => {
    const mod = await import('pptxgenjs');
    const PptxGenJS = (mod as any).default || (mod as any);

    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';

    const title = report.title || 'Weekly Snapshot';
    const fileName = `${slugify(title)}.pptx`;

    const theme = {
      brand: '073D44',
      brand2: '407B7E',
      surface: 'FFFFFF',
      line: 'E2E8F0',
      headerFill: 'CFE8E8',
      headerText: '073D44',
      text: '0F172A',
      subtext: '334155',
    };

    const SLIDE_W = 13.33;
    const SLIDE_H = 7.5;
    void SLIDE_H;

    const ShapeType = (pptx as any).ShapeType || (PptxGenJS as any).ShapeType || {};
    const SH_RECT = ShapeType.rect || 'rect';
    const SH_RRECT = ShapeType.roundRect || 'roundRect';

    const truncate = (value: string, max: number) => {
      const s = (value || '').trim();
      if (!s) return '';
      if (s.length <= max) return s;
      return `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
    };

    const pillColors = (value: string) => {
      if (value === HealthStatus.GREEN) return { fill: 'DCFCE7', text: '065F46', line: '86EFAC' };
      if (value === HealthStatus.YELLOW) return { fill: 'FEF9C3', text: '854D0E', line: 'FDE047' };
      if (value === HealthStatus.RED) return { fill: 'FEE2E2', text: '9F1239', line: 'FDA4AF' };
      if (value === LoadStatus.NORMAL) return { fill: 'DCFCE7', text: '065F46', line: '86EFAC' };
      if (value === LoadStatus.UNDERUTILIZED) return { fill: 'FEF9C3', text: '854D0E', line: 'FDE047' };
      if (value === LoadStatus.OVERLOADED) return { fill: 'FEE2E2', text: '9F1239', line: 'FDA4AF' };
      return { fill: 'E2E8F0', text: '334155', line: 'CBD5E1' };
    };

    const confidenceColors = (value: string) => {
      if (value === 'HIGH') return { fill: 'E0E7FF', text: '1E3A8A', line: 'A5B4FC' };
      if (value === 'MED' || value === 'MEDIUM') return { fill: 'FEF9C3', text: '854D0E', line: 'FDE047' };
      if (value === 'LOW') return { fill: 'FEE2E2', text: '9F1239', line: 'FDA4AF' };
      return { fill: 'E2E8F0', text: '334155', line: 'CBD5E1' };
    };

    const addTopBar = (slide: any) => {
      slide.background = { color: theme.surface };
      slide.addShape(SH_RECT, { x: 0, y: 0, w: SLIDE_W, h: 0.78, fill: { color: theme.brand } });
      slide.addText('QAPulse | QA Weekly Reports', {
        x: 0.6,
        y: 0.22,
        w: 8.5,
        h: 0.4,
        fontFace: 'Calibri',
        fontSize: 12,
        bold: true,
        color: 'FFFFFF',
      });
      slide.addText(formatLocalISODate(new Date()), {
        x: 9.2,
        y: 0.22,
        w: 3.5,
        h: 0.4,
        fontFace: 'Calibri',
        fontSize: 11,
        color: 'FFFFFF',
        align: 'right',
      });
    };

    const addCard = (slide: any, opts: { x: number; y: number; w: number; h: number; title: string }) => {
      slide.addShape(SH_RRECT, {
        x: opts.x,
        y: opts.y,
        w: opts.w,
        h: opts.h,
        fill: { color: theme.surface },
        line: { color: theme.line, width: 1 },
        radius: 12,
      });
      slide.addShape(SH_RRECT, {
        x: opts.x,
        y: opts.y,
        w: opts.w,
        h: 0.6,
        fill: { color: theme.headerFill },
        line: { color: theme.line, width: 1 },
        radius: 12,
      });
      slide.addText(opts.title, {
        x: opts.x + 0.3,
        y: opts.y + 0.16,
        w: opts.w - 0.6,
        h: 0.4,
        fontFace: 'Calibri',
        fontSize: 14,
        bold: true,
        color: theme.headerText,
      });
      return { bodyX: opts.x + 0.3, bodyY: opts.y + 0.8, bodyW: opts.w - 0.6, bodyH: opts.h - 1.0 };
    };

    function chunk<T>(arr: T[], size: number): T[][] {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    }

    const goalChunks = chunk<GoalRow>(report.goals || [], 7);
    (goalChunks.length ? goalChunks : [[]]).forEach((chunkGoals, idx) => {
      const slide = pptx.addSlide();
      addTopBar(slide);
      slide.addText(title, { x: 0.6, y: 1.05, w: 12.2, h: 0.6, fontFace: 'Calibri', fontSize: 20, bold: true, color: theme.text });

      const card = addCard(slide, { x: 0.6, y: 1.75, w: 12.15, h: 5.35, title: idx === 0 ? 'Goals & Team Health' : 'Goals & Team Health (cont.)' });

      const colGoal = 5.0;
      const colMetric = 4.3;
      const colHealth = 1.3;
      const colConf = 1.25;
      const tableX = card.bodyX;
      const tableY = card.bodyY;
      const rowH = 0.55;

      slide.addShape(SH_RRECT, {
        x: tableX,
        y: tableY,
        w: card.bodyW,
        h: rowH,
        fill: { color: theme.headerFill },
        line: { color: theme.line, width: 1 },
        radius: 8,
      });
      slide.addText('Goal', { x: tableX + 0.2, y: tableY + 0.16, w: colGoal - 0.3, h: 0.3, fontFace: 'Calibri', fontSize: 11, bold: true, color: theme.headerText });
      slide.addText('Success Metric', { x: tableX + colGoal, y: tableY + 0.16, w: colMetric - 0.2, h: 0.3, fontFace: 'Calibri', fontSize: 11, bold: true, color: theme.headerText });
      slide.addText('Health', { x: tableX + colGoal + colMetric, y: tableY + 0.16, w: colHealth, h: 0.3, fontFace: 'Calibri', fontSize: 11, bold: true, color: theme.headerText, align: 'center' });
      slide.addText('Confidence', { x: tableX + colGoal + colMetric + colHealth, y: tableY + 0.16, w: colConf, h: 0.3, fontFace: 'Calibri', fontSize: 11, bold: true, color: theme.headerText, align: 'center' });

      chunkGoals.forEach((g, rowIdx) => {
        const y = tableY + rowH + rowIdx * rowH;
        slide.addShape(SH_RECT, { x: tableX, y, w: card.bodyW, h: rowH, fill: { color: 'FFFFFF' }, line: { color: theme.line, width: 1 } });
        slide.addText(truncate(g.goal, 80) || '—', { x: tableX + 0.2, y: y + 0.12, w: colGoal - 0.3, h: 0.34, fontFace: 'Calibri', fontSize: 11, color: theme.subtext });
        slide.addText(truncate(g.successMetric, 70) || '—', { x: tableX + colGoal, y: y + 0.12, w: colMetric - 0.2, h: 0.34, fontFace: 'Calibri', fontSize: 11, color: theme.subtext });

        const health = pillColors(g.health);
        const healthX = tableX + colGoal + colMetric + 0.08;
        slide.addShape(SH_RRECT, { x: healthX, y: y + 0.13, w: colHealth - 0.16, h: 0.3, fill: { color: health.fill }, line: { color: health.line, width: 1 }, radius: 10 });
        slide.addText(String(g.health || 'N/A').toUpperCase(), { x: healthX, y: y + 0.16, w: colHealth - 0.16, h: 0.25, fontFace: 'Calibri', fontSize: 9, bold: true, color: health.text, align: 'center' });

        const confValue = g.confidence === 'MED' ? 'MEDIUM' : String(g.confidence || 'N/A').toUpperCase();
        const conf = confidenceColors(confValue);
        const confX = tableX + colGoal + colMetric + colHealth + 0.08;
        slide.addShape(SH_RRECT, { x: confX, y: y + 0.13, w: colConf - 0.16, h: 0.3, fill: { color: conf.fill }, line: { color: conf.line, width: 1 }, radius: 10 });
        slide.addText(confValue, { x: confX, y: y + 0.16, w: colConf - 0.16, h: 0.25, fontFace: 'Calibri', fontSize: 9, bold: true, color: conf.text, align: 'center' });
      });

      if (!chunkGoals.length) {
        slide.addText('No goals', { x: tableX, y: tableY + 1.0, w: card.bodyW, h: 0.5, fontFace: 'Calibri', fontSize: 12, color: theme.subtext });
      }
    });

    const executionSlides: ExecutionReadinessSlide[] =
      isOverall
        ? (report.executionReadinessSlides?.length ? report.executionReadinessSlides : [])
        : [
            {
              projectId: report.projectId,
              sprintHealth: report.sprintHealth,
              capacity: report.capacity,
              strength: report.strength,
              bottlenecks: report.bottlenecks,
              decisions: report.decisions,
            },
          ];
    const ensuredSlides: ExecutionReadinessSlide[] = executionSlides.length ? executionSlides : [
      {
        projectId: report.projectId,
        sprintHealth: report.sprintHealth,
        capacity: report.capacity,
        strength: report.strength,
        bottlenecks: report.bottlenecks,
        decisions: report.decisions,
      },
    ];

    ensuredSlides.forEach((s) => {
      const slideProject = projects.find(p => p.id === s.projectId);
      const slideTitleProjectName = s.projectNameOverride || slideProject?.name || 'Project';
      const slide2 = pptx.addSlide();
      addTopBar(slide2);
      slide2.addText(`${slideTitleProjectName} Execution Readiness & Friction`, { x: 0.6, y: 1.05, w: 12.2, h: 0.6, fontFace: 'Calibri', fontSize: 18, bold: true, color: theme.text });

      const leftCard = addCard(slide2, { x: 0.6, y: 1.75, w: 6.0, h: 5.35, title: 'Team Health' });
      const rightCard = addCard(slide2, { x: 6.85, y: 1.75, w: 5.9, h: 5.35, title: 'Friction' });

      const addSectionTitle = (slide: any, x: number, y: number, w: number, text: string) => {
        slide.addText(text, { x, y, w, h: 0.3, fontFace: 'Calibri', fontSize: 12, bold: true, color: theme.text });
      };

      const addKeyValue = (slide: any, x: number, y: number, w: number, key: string, value: string) => {
        slide.addText(key, { x, y, w: w * 0.55, h: 0.28, fontFace: 'Calibri', fontSize: 11, color: theme.subtext });
        slide.addText(value || 'N/A', { x: x + w * 0.55, y, w: w * 0.45, h: 0.28, fontFace: 'Calibri', fontSize: 11, bold: true, color: theme.text, align: 'right' });
      };

      const addStatusPill = (slide: any, x: number, y: number, w: number, label: string) => {
        const c = pillColors(label);
        slide.addShape(SH_RRECT, { x, y, w, h: 0.28, fill: { color: c.fill }, line: { color: c.line, width: 1 }, radius: 10 });
        slide.addText(String(label || 'N/A').toUpperCase(), { x, y: y + 0.04, w, h: 0.22, fontFace: 'Calibri', fontSize: 9, bold: true, color: c.text, align: 'center' });
      };

      let y = leftCard.bodyY;
      addSectionTitle(slide2, leftCard.bodyX, y, leftCard.bodyW, 'Sprint Health');
      y += 0.38;
      addKeyValue(slide2, leftCard.bodyX, y, leftCard.bodyW, 'Sprint start date', s.sprintHealth?.startDate || 'N/A');
      y += 0.34;
      slide2.addText('Sprint goal clarity', { x: leftCard.bodyX, y, w: leftCard.bodyW * 0.6, h: 0.28, fontFace: 'Calibri', fontSize: 11, color: theme.subtext });
      addStatusPill(slide2, leftCard.bodyX + leftCard.bodyW * 0.6, y, leftCard.bodyW * 0.4, s.sprintHealth?.goalClarity || 'NA');
      y += 0.34;
      slide2.addText('Sprint readiness', { x: leftCard.bodyX, y, w: leftCard.bodyW * 0.6, h: 0.28, fontFace: 'Calibri', fontSize: 11, color: theme.subtext });
      addStatusPill(slide2, leftCard.bodyX + leftCard.bodyW * 0.6, y, leftCard.bodyW * 0.4, s.sprintHealth?.readiness || 'NA');

      y += 0.48;
      addSectionTitle(slide2, leftCard.bodyX, y, leftCard.bodyW, 'Team Health (Capacity)');
      y += 0.38;
      addKeyValue(slide2, leftCard.bodyX, y, leftCard.bodyW, 'Planned team hours', String(s.capacity?.plannedHours ?? 'N/A'));
      y += 0.34;
      addKeyValue(slide2, leftCard.bodyX, y, leftCard.bodyW, 'Committed team hours', String(s.capacity?.committedHours ?? 'N/A'));
      y += 0.34;
      addKeyValue(slide2, leftCard.bodyX, y, leftCard.bodyW, 'Surplus/Deficit (hrs)', String(s.capacity?.surplusDeficitHours ?? 'N/A'));
      y += 0.34;
      slide2.addText('Load status', { x: leftCard.bodyX, y, w: leftCard.bodyW * 0.6, h: 0.28, fontFace: 'Calibri', fontSize: 11, color: theme.subtext });
      addStatusPill(slide2, leftCard.bodyX + leftCard.bodyW * 0.6, y, leftCard.bodyW * 0.4, s.capacity?.loadStatus || 'NA');

      y += 0.48;
      addSectionTitle(slide2, leftCard.bodyX, y, leftCard.bodyW, 'Team Strength');
      y += 0.38;
      slide2.addText('Active contributors', { x: leftCard.bodyX, y, w: leftCard.bodyW, h: 0.28, fontFace: 'Calibri', fontSize: 11, color: theme.subtext });
      y += 0.28;
      slide2.addText(truncate(s.strength?.activeContributorNames || 'N/A', 120), { x: leftCard.bodyX, y, w: leftCard.bodyW, h: 0.5, fontFace: 'Calibri', fontSize: 11, bold: true, color: theme.text });
      y += 0.58;
      addKeyValue(slide2, leftCard.bodyX, y, leftCard.bodyW, 'Critical role gaps', s.strength?.criticalRoleGaps ? 'Yes' : 'No');

      const rightBottlenecks = (s.bottlenecks?.length ? s.bottlenecks : report.bottlenecks) || [];
      const rightDecisions = (s.decisions?.length ? s.decisions : report.decisions) || [];
      let ry = rightCard.bodyY;
      addSectionTitle(slide2, rightCard.bodyX, ry, rightCard.bodyW, 'Bottlenecks');
      ry += 0.4;
      const bottleneckText = (rightBottlenecks.length ? rightBottlenecks : ['N/A']).slice(0, 6).map((b, i) => `${i + 1}. ${truncate(b || 'N/A', 80)}`).join('\n');
      slide2.addText(bottleneckText, { x: rightCard.bodyX, y: ry, w: rightCard.bodyW, h: 2.2, fontFace: 'Calibri', fontSize: 11, color: theme.subtext });

      ry += 2.35;
      addSectionTitle(slide2, rightCard.bodyX, ry, rightCard.bodyW, 'Decisions Pending');
      ry += 0.4;
      const decisionsText = (rightDecisions.length ? rightDecisions : [{ decisionText: 'N/A' }]).slice(0, 6).map((d, i) => `${i + 1}. ${truncate(d.decisionText || 'N/A', 90)}`).join('\n');
      slide2.addText(decisionsText, { x: rightCard.bodyX, y: ry, w: rightCard.bodyW, h: 2.4, fontFace: 'Calibri', fontSize: 11, color: theme.subtext });
    });

    const threadChunks = chunk<ThreadRow>(report.threads || [], 10);
    (threadChunks.length ? threadChunks : [[]]).forEach((chunkThreads, chunkIdx) => {
      const slide = pptx.addSlide();
      addTopBar(slide);
      slide.addText('Top Team Threads (Cognitive Load)', { x: 0.6, y: 1.05, w: 12.2, h: 0.6, fontFace: 'Calibri', fontSize: 18, bold: true, color: theme.text });

      const card = addCard(slide, { x: 0.6, y: 1.75, w: 12.15, h: 5.35, title: chunkIdx === 0 ? 'Threads' : 'Threads (cont.)' });
      const x = card.bodyX;
      const y = card.bodyY;
      const rowH = 0.55;
      const colProduct = 2.4;
      const colThread = 6.2;
      const colOwner = 2.2;
      const colStatus = card.bodyW - colProduct - colThread - colOwner;

      slide.addShape(SH_RRECT, { x, y, w: card.bodyW, h: rowH, fill: { color: theme.headerFill }, line: { color: theme.line, width: 1 }, radius: 8 });
      slide.addText('Product', { x: x + 0.2, y: y + 0.16, w: colProduct - 0.2, h: 0.3, fontFace: 'Calibri', fontSize: 11, bold: true, color: theme.headerText });
      slide.addText('Thread', { x: x + colProduct, y: y + 0.16, w: colThread - 0.2, h: 0.3, fontFace: 'Calibri', fontSize: 11, bold: true, color: theme.headerText });
      slide.addText('Owner', { x: x + colProduct + colThread, y: y + 0.16, w: colOwner - 0.2, h: 0.3, fontFace: 'Calibri', fontSize: 11, bold: true, color: theme.headerText });
      slide.addText('Status', { x: x + colProduct + colThread + colOwner, y: y + 0.16, w: colStatus - 0.2, h: 0.3, fontFace: 'Calibri', fontSize: 11, bold: true, color: theme.headerText });

      chunkThreads.slice(0, 7).forEach((t, rowIdx) => {
        const yy = y + rowH + rowIdx * rowH;
        slide.addShape(SH_RECT, { x, y: yy, w: card.bodyW, h: rowH, fill: { color: 'FFFFFF' }, line: { color: theme.line, width: 1 } });
        slide.addText(truncate(t.product || headerProjectCode || 'Product', 22), { x: x + 0.2, y: yy + 0.12, w: colProduct - 0.25, h: 0.34, fontFace: 'Calibri', fontSize: 11, color: theme.subtext });
        slide.addText(truncate(t.thread, 110), { x: x + colProduct, y: yy + 0.12, w: colThread - 0.25, h: 0.34, fontFace: 'Calibri', fontSize: 11, color: theme.subtext });
        slide.addText(truncate(getUserName(t.ownerId), 24), { x: x + colProduct + colThread, y: yy + 0.12, w: colOwner - 0.25, h: 0.34, fontFace: 'Calibri', fontSize: 11, color: theme.subtext });
        slide.addText(String(t.status || '').replace(/_/g, ' '), { x: x + colProduct + colThread + colOwner, y: yy + 0.12, w: colStatus - 0.25, h: 0.34, fontFace: 'Calibri', fontSize: 10, bold: true, color: theme.text });
      });

      if (!chunkThreads.length) {
        slide.addText('No threads', { x, y: y + 1.0, w: card.bodyW, h: 0.5, fontFace: 'Calibri', fontSize: 12, color: theme.subtext });
      }
    });

    try {
      await pptx.writeFile({ fileName });
    } catch {
      window.alert('Could not generate PPT. Please try again.');
    }
  };

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="bg-white border border-slate-200 rounded-[20px] shadow-sm overflow-hidden">
          <div className="px-6 py-5 bg-gradient-to-r from-[#073D44] to-[#407B7E]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-[28px] leading-[36px] font-bold tracking-tight text-white">{report.title}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-white/80 font-medium">
                  <span className="bg-white/15 border border-white/20 px-2 py-0.5 rounded text-white uppercase font-bold tracking-widest">{headerProjectCode}</span>
                  <span>•</span>
                  <span>{getMonthName(report.month)} - Week {report.weekOfMonth}</span>
                  <span>•</span>
                  <span>{report.startDate} – {report.endDate}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-widest ${
                  report.status === ReportStatus.PUBLISHED ? 'bg-white text-[#073D44]' : 'bg-white/15 text-white border border-white/20'
                }`}>
                  {report.status}
                </span>
              </div>
            </div>
            <div className="print-hide mt-5 flex flex-wrap gap-3">
              <button
                onClick={handleExportPDF}
                className="h-10 px-4 rounded-xl bg-white text-[#073D44] font-semibold text-[13px] hover:bg-white/90 transition-colors"
              >
                Download PDF
              </button>
              <button
                onClick={handleExportPPT}
                className="h-10 px-4 rounded-xl bg-white text-[#073D44] font-semibold text-[13px] hover:bg-white/90 transition-colors"
              >
                Download PPT
              </button>
              {isOwner && (
                <button
                  onClick={() => { if(window.confirm('Delete this report?')) { onDelete(report.id); navigate('/'); }}}
                  className="h-10 px-4 rounded-xl bg-white text-red-700 font-semibold text-[13px] hover:bg-white/90 transition-colors"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div id="printable-report" className="max-w-5xl mx-auto space-y-8">
        <div className="bg-white border border-slate-200 rounded-[20px] shadow-sm overflow-hidden" style={{ breakAfter: 'page' }}>
          <div className="px-6 py-4 bg-[#CFE8E8] border-b border-[#073D44]/15">
            <div className="text-[16px] font-semibold text-[#073D44]">Goals &amp; Team Health</div>
          </div>
          <div className="p-6">
            <div className="text-[14px] font-semibold text-slate-900">{report.title}</div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-[#CFE8E8]">
                  <tr className="text-[11px] text-[#073D44]">
                    <th className="px-3 py-2 font-semibold">Goal</th>
                    <th className="px-3 py-2 font-semibold">Success Metric</th>
                    <th className="px-3 py-2 font-semibold w-[160px]">Health</th>
                    <th className="px-3 py-2 font-semibold w-[160px]">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {report.goals.map((g, idx) => (
                    <tr key={idx} className="border-t border-slate-200 text-[12px] text-slate-800">
                      <td className="px-3 py-2">{g.goal}</td>
                      <td className="px-3 py-2">{g.successMetric}</td>
                      <td className="px-3 py-2">
                        {(() => {
                          const pill = getHealthPill(g.health);
                          return (
                            <span className={`${pillBase} ${pill.ring}`}>
                              <span className={`h-2 w-2 rounded-full ${pill.dot}`} />
                              {pill.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`${pillBase} bg-slate-100 text-slate-800 ring-slate-200`}>
                          {g.confidence === 'MED' ? 'MEDIUM' : g.confidence}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {executionSlidesToRender.map((s, slideIdx) => {
          const slideProject = projects.find(p => p.id === s.projectId);
          const slideTitle = `${s.projectNameOverride || slideProject?.name || 'Project'} Execution Readiness & Friction`;
          return (
            <div key={`${s.projectId || 'overall'}-${slideIdx}`} className="bg-white border border-slate-200 rounded-[20px] shadow-sm overflow-hidden" style={{ breakAfter: 'page' }}>
              <div className="px-6 py-4 bg-[#CFE8E8] border-b border-[#073D44]/15">
                <div className="text-[16px] font-semibold text-[#073D44]">{slideTitle}</div>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-6 text-[12px] text-slate-700">
                    <div className="space-y-2">
                      <div className="text-[12px] font-bold text-slate-900 tracking-tight">Sprint Health</div>
                      <div className="grid grid-cols-1 gap-1">
                        <div>Sprint start date: <span className="font-semibold text-slate-900">{s.sprintHealth.startDate}</span></div>
                        <div className="flex items-center gap-2">
                          <span>Sprint goal clarity:</span>
                          {(() => {
                            const pill = getHealthPill(s.sprintHealth.goalClarity);
                            return (
                              <span className={`${pillBase} ${pill.ring}`}>
                                <span className={`h-2 w-2 rounded-full ${pill.dot}`} />
                                {pill.label}
                              </span>
                            );
                          })()}
                        </div>
                        <div className="flex items-center gap-2">
                          <span>Sprint readiness:</span>
                          {(() => {
                            const pill = getHealthPill(s.sprintHealth.readiness);
                            return (
                              <span className={`${pillBase} ${pill.ring}`}>
                                <span className={`h-2 w-2 rounded-full ${pill.dot}`} />
                                {pill.label}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-[12px] font-bold text-slate-900 tracking-tight">Team Health (Capacity)</div>
                      <div className="grid grid-cols-1 gap-1">
                        <div>Planned team hours: <span className="font-semibold text-slate-900">{s.capacity.plannedHours}</span></div>
                        <div>Committed team hours: <span className="font-semibold text-slate-900">{s.capacity.committedHours}</span></div>
                        <div>Surplus/Deficit (hrs): <span className="font-semibold text-slate-900">{s.capacity.surplusDeficitHours}</span></div>
                        <div className="flex items-center gap-2">
                          <span>Load status:</span>
                          {(() => {
                            const pill = getLoadStatusPill(s.capacity.loadStatus);
                            return (
                              <span className={`${pillBase} ${pill.ring}`}>
                                <span className={`h-2 w-2 rounded-full ${pill.dot}`} />
                                {pill.label}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-[12px] font-bold text-slate-900 tracking-tight">Team Strength</div>
                      <div className="grid grid-cols-1 gap-1">
                        <div>Active contributors: <span className="font-semibold text-slate-900">{s.strength.activeContributorNames || s.strength.activeContributors}</span></div>
                        <div>Critical role gaps: <span className="font-semibold text-slate-900">{s.strength.criticalRoleGaps ? 'Yes' : 'No'}</span></div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-[12px] font-bold text-slate-900 tracking-tight">UE/D Health</div>
                      <div className="grid grid-cols-1 gap-1">
                        <div>Last discussion: <span className="font-semibold text-slate-900">{report.uedHealth.lastDiscussion}</span></div>
                        <div>Days since last: <span className="font-semibold text-slate-900">{report.uedHealth.daysSinceLast}</span></div>
                        <div>Next scheduled: <span className="font-semibold text-slate-900">{report.uedHealth.nextScheduled}</span></div>
                        <div>Data available: <span className="font-semibold text-slate-900">{report.uedHealth.dataAvailable ? 'Yes' : 'No'}</span></div>
                        <div className="flex items-center gap-2">
                          <span>Status:</span>
                          {(() => {
                            const pill = getHealthPill(report.uedHealth.status);
                            return (
                              <span className={`${pillBase} ${pill.ring}`}>
                                <span className={`h-2 w-2 rounded-full ${pill.dot}`} />
                                {pill.label}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-8 text-[12px] text-slate-700">
                    <div className="space-y-2">
                      <div className="text-[12px] font-bold text-slate-900 tracking-tight">Bottlenecks</div>
                      <ol className="list-decimal ml-5 space-y-1">
                        {(s.bottlenecks?.length ? s.bottlenecks : report.bottlenecks).map((b, idx) => (
                          <li key={idx} className="text-slate-800">{b || 'N/A'}</li>
                        ))}
                      </ol>
                    </div>
                    <div className="space-y-2">
                      <div className="text-[12px] font-bold text-slate-900 tracking-tight">Decisions Pending</div>
                      <ol className="list-decimal ml-5 space-y-1">
                        {(s.decisions?.length ? s.decisions : report.decisions).map((d, idx) => (
                          <li key={idx} className="text-slate-800">{d.decisionText || 'N/A'}</li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <div className="bg-white border border-slate-200 rounded-[20px] shadow-sm overflow-hidden" style={{ breakAfter: 'auto' }}>
          <div className="px-6 py-4 bg-[#CFE8E8] border-b border-[#073D44]/15">
            <div className="text-[16px] font-semibold text-[#073D44]">Top Team Threads (Cognitive Load)</div>
          </div>
          <div className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-left border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-[#CFE8E8]">
                  <tr className="text-[11px] text-[#073D44]">
                    <th className="px-3 py-2 font-semibold w-[160px]">Product</th>
                    <th className="px-3 py-2 font-semibold">Thread</th>
                    <th className="px-3 py-2 font-semibold w-[180px]">Owner</th>
                    <th className="px-3 py-2 font-semibold w-[180px]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.threads.map((t, idx) => (
                    <tr key={idx} className="border-t border-slate-200 text-[12px] text-slate-800">
                      <td className="px-3 py-2">{t.product || headerProjectCode || ''}</td>
                      <td className="px-3 py-2">{t.thread}</td>
                      <td className="px-3 py-2">{getUserName(t.ownerId)}</td>
                      <td className="px-3 py-2">
                        {(() => {
                          const pill = getThreadStatusPill(t.status);
                          return (
                            <span className={`${pillBase} ${pill.ring}`}>
                              <span className={`h-2 w-2 rounded-full ${pill.dot}`} />
                              {pill.label}
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DetailView;
