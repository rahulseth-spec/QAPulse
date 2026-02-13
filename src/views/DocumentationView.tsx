import React from 'react';

const DocumentationView: React.FC = () => {
  const CheckIcon = (props: { className?: string }) => (
    <svg className={props.className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-10 pb-20">
      <div className="bg-gradient-to-br from-[#073D44] to-[#407B7E] rounded-[20px] p-8 md:p-10 text-white border border-white/10 shadow-sm">
        <h1 className="text-[28px] leading-[36px] font-bold tracking-tight">System Docs</h1>
        <p className="mt-3 text-[15px] leading-[24px] text-white/80">QAPulse system design, access model, and search architecture.</p>
      </div>

      <section className="space-y-6">
        <h2 className="text-[18px] leading-[28px] font-bold text-slate-900 tracking-tight">Access Model</h2>
        <div className="bg-white rounded-[20px] border border-slate-200 p-6 md:p-8 shadow-sm">
          <p className="text-[14px] leading-[22px] text-slate-600">
            QAPulse follows a <strong>Unified Feature Model</strong>. All authenticated users gain immediate access to the full suite of QA management tools without role-based friction.
          </p>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-4 bg-[#407B7E]/5 border border-[#407B7E]/20 rounded-xl">
              <span className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-[#073D44]">
                <CheckIcon className="text-[#073D44]" />
              </span>
              <span className="text-[14px] font-semibold text-slate-900">Create & Publish Weekly Reports</span>
            </div>
            <div className="flex items-center gap-3 p-4 bg-[#407B7E]/5 border border-[#407B7E]/20 rounded-xl">
              <span className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-[#073D44]">
                <CheckIcon className="text-[#073D44]" />
              </span>
              <span className="text-[14px] font-semibold text-slate-900">Moderate & Delete Archives</span>
            </div>
            <div className="flex items-center gap-3 p-4 bg-[#407B7E]/5 border border-[#407B7E]/20 rounded-xl">
              <span className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-[#073D44]">
                <CheckIcon className="text-[#073D44]" />
              </span>
              <span className="text-[14px] font-semibold text-slate-900">Create Revisions of Published Data</span>
            </div>
            <div className="flex items-center gap-3 p-4 bg-[#407B7E]/5 border border-[#407B7E]/20 rounded-xl">
              <span className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-[#073D44]">
                <CheckIcon className="text-[#073D44]" />
              </span>
              <span className="text-[14px] font-semibold text-slate-900">Access Advanced AI Summarization</span>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-[18px] leading-[28px] font-bold text-slate-900 tracking-tight">MVP Roadmap</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[#407B7E]/5 p-6 rounded-[20px] border border-[#407B7E]/20">
            <h3 className="font-extrabold text-[#073D44] uppercase tracking-widest text-[11px] mb-4">Phase 1: MVP Core</h3>
            <ul className="text-[14px] space-y-2 list-disc pl-4 text-slate-700">
              <li>Weekly Report lifecycle (Draft/Published)</li>
              <li>Revision system (History tracking)</li>
              <li>Advanced Search (Year/Month/Week of Month)</li>
              <li>Audit trails (Created/Updated metadata)</li>
            </ul>
          </div>
          <div className="bg-slate-50 p-6 rounded-[20px] border border-slate-200">
            <h3 className="font-extrabold text-slate-600 uppercase tracking-widest text-[11px] mb-4">Phase 2: Intelligent Tools</h3>
            <ul className="text-[14px] space-y-2 list-disc pl-4 text-slate-700">
              <li>Attachments module (Evidence & logs)</li>
              <li>Gemini Summarization for executive snapshots</li>
              <li>PDF/Docx Export engine</li>
              <li>Customizable Team Templates</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-[18px] leading-[28px] font-bold text-slate-900 tracking-tight">Data Model Schema</h2>
        <pre className="bg-slate-900 text-slate-200 p-6 rounded-xl text-xs overflow-x-auto leading-relaxed border border-slate-800 shadow-sm">
{`{
  "report_id": "UUID",
  "project_id": "UUID",
  "lifecycle": "DRAFT | PUBLISHED | APPROVED",
  "time_indices": {
    "iso_week": 20,
    "year": 2024,
    "month": 5,
    "week_of_month": 3
  },
  "sections": {
    "goals": "Array<GoalRow>",
    "capacity": "CapacityObject",
    "threads": "Array<ThreadRow>"
  },
  "audit": {
    "created_by": "UserID",
    "updated_at": "ISO_8601"
  }
}`}
        </pre>
      </section>

      <section className="space-y-6">
        <h2 className="text-[18px] leading-[28px] font-bold text-slate-900 tracking-tight">Search Strategy</h2>
        <div className="p-6 md:p-8 bg-white border border-slate-200 rounded-[20px] space-y-4 text-[14px] leading-relaxed text-slate-600 shadow-sm">
          <p>We leverage a <strong>Composite Index</strong> strategy for the search engine:</p>
          <ul className="list-decimal pl-6 space-y-2">
            <li><strong>Temporal Sharding:</strong> Filter by <code>year</code> and <code>month</code> first to reduce dataset scan size.</li>
            <li><strong>Relational Filtering:</strong> Apply <code>project_id</code> and <code>user_id</code> intersections.</li>
            <li><strong>Status Toggles:</strong> Unified visibility for all published content.</li>
            <li><strong>Revision Linking:</strong> <code>revision_of</code> pointers allow the UI to collapse history into a single record view.</li>
          </ul>
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-[18px] leading-[28px] font-bold text-slate-900 tracking-tight">Senior QA Improvements</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm">
            <h4 className="font-bold text-[12px] uppercase tracking-wider text-slate-600 mb-2">Analytics</h4>
            <p className="text-[13px] leading-[20px] text-slate-600">Aggregate "Health" across 12 weeks to identify systemic team fatigue.</p>
          </div>
          <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm">
            <h4 className="font-bold text-[12px] uppercase tracking-wider text-slate-600 mb-2">Automation</h4>
            <p className="text-[13px] leading-[20px] text-slate-600">Auto-reminders on Friday 3PM if draft is not yet created for the week.</p>
          </div>
          <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm">
            <h4 className="font-bold text-[12px] uppercase tracking-wider text-slate-600 mb-2">Integration</h4>
            <p className="text-[13px] leading-[20px] text-slate-600">Slack/Discord hooks to broadcast published snapshots to stakeholders.</p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default DocumentationView;
